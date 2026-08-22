using Application.Abstractions.Messaging;
using Application.Abstractions.Services;
using Application.Extraction.Jobs;
using Application.Settings;
using Domain.Events;
using Microsoft.Extensions.Logging;
using SharedKernel;

namespace Application.EventHandlers;

/// <summary>
/// Handles ModelUploadedEvent by enqueueing a thumbnail generation job,
/// gated by the GenerateThumbnailOnUpload application setting.
///
/// <para>
/// Whenever that thumbnail job is <b>skipped</b>, this handler queues a Geometry
/// extraction job instead. Scene-graph extraction rides on the thumbnail render
/// (the worker's thumbnail processor is what calls <c>saveSceneGraph</c>), so
/// "don't render a thumbnail" used to silently mean "never index this model":
/// no parts, no technical metadata, no search document. A store import attaches
/// the store's own turntable and so takes exactly that path - the imported model
/// existed with a picture and could not be found by <c>search_assets</c>.
/// Indexing is not thumbnailing, and neither reason for skipping the render
/// (the caller supplied its own, or the operator turned rendering off) is a
/// reason to leave the asset out of search.
/// </para>
/// </summary>
public class ModelUploadedEventHandler : IDomainEventHandler<ModelUploadedEvent>
{
    private readonly IThumbnailQueue _thumbnailQueue;
    private readonly ISettingsService _settingsService;
    private readonly ICommandHandler<EnqueueExtractionJobCommand, EnqueueExtractionJobResponse> _enqueueExtraction;
    private readonly ILogger<ModelUploadedEventHandler> _logger;

    public ModelUploadedEventHandler(
        IThumbnailQueue thumbnailQueue,
        ISettingsService settingsService,
        ICommandHandler<EnqueueExtractionJobCommand, EnqueueExtractionJobResponse> enqueueExtraction,
        ILogger<ModelUploadedEventHandler> logger)
    {
        _thumbnailQueue = thumbnailQueue ?? throw new ArgumentNullException(nameof(thumbnailQueue));
        _settingsService = settingsService ?? throw new ArgumentNullException(nameof(settingsService));
        _enqueueExtraction = enqueueExtraction ?? throw new ArgumentNullException(nameof(enqueueExtraction));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<Result> Handle(ModelUploadedEvent domainEvent, CancellationToken cancellationToken)
    {
        try
        {
            _logger.LogInformation("Handling ModelUploadedEvent for model {ModelId} version {ModelVersionId} with hash {ModelHash}, IsNewModel: {IsNewModel}",
                domainEvent.ModelId, domainEvent.ModelVersionId, domainEvent.ModelHash, domainEvent.IsNewModel);

            // The upload itself may opt out (e.g. a store import that attaches the store's
            // already-rendered turntable) - don't queue a redundant render.
            if (!domainEvent.GenerateThumbnail)
            {
                _logger.LogInformation("Skipping thumbnail job enqueue for model {ModelId} version {ModelVersionId} - the upload supplied its own thumbnail.",
                    domainEvent.ModelId, domainEvent.ModelVersionId);
                return await EnqueueGeometryExtractionAsync(domainEvent, "the upload supplied its own thumbnail", cancellationToken);
            }

            var settings = await _settingsService.GetSettingsAsync(cancellationToken);
            if (!settings.GenerateThumbnailOnUpload)
            {
                _logger.LogInformation("Skipping thumbnail job enqueue for model {ModelId} version {ModelVersionId} - GenerateThumbnailOnUpload is disabled.",
                    domainEvent.ModelId, domainEvent.ModelVersionId);
                return await EnqueueGeometryExtractionAsync(domainEvent, "thumbnail rendering is disabled", cancellationToken);
            }

            // Enqueue thumbnail generation job - the queue handles idempotency automatically
            var job = await _thumbnailQueue.EnqueueAsync(
                domainEvent.ModelId,
                domainEvent.ModelVersionId,
                domainEvent.ModelHash,
                cancellationToken: cancellationToken);

            _logger.LogInformation("Successfully enqueued thumbnail job {JobId} for model {ModelId} version {ModelVersionId} with status {Status}",
                job.Id, domainEvent.ModelId, domainEvent.ModelVersionId, job.Status);

            return Result.Success();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to enqueue thumbnail job for model {ModelId} version {ModelVersionId} with hash {ModelHash}",
                domainEvent.ModelId, domainEvent.ModelVersionId, domainEvent.ModelHash);

            return Result.Failure(new Error("ThumbnailJobEnqueueFailed",
                $"Failed to enqueue thumbnail job for model {domainEvent.ModelId} version {domainEvent.ModelVersionId}: {ex.Message}"));
        }
    }

    /// <summary>
    /// Queues the Geometry extraction that the skipped thumbnail render would otherwise
    /// have carried, so the model still gets parts, technical metadata and a search
    /// document. Deduped by the queue, so a re-upload of the same version is a no-op.
    /// </summary>
    private async Task<Result> EnqueueGeometryExtractionAsync(
        ModelUploadedEvent domainEvent,
        string reason,
        CancellationToken cancellationToken)
    {
        var result = await _enqueueExtraction.Handle(
            new EnqueueExtractionJobCommand(
                "Model",
                domainEvent.ModelId,
                domainEvent.ModelVersionId,
                ExtractorFamilies.Geometry,
                domainEvent.ModelHash),
            cancellationToken);

        if (result.IsFailure)
        {
            // Deliberately not a failure Result: the upload is already durable and the
            // model is usable without an index. Report it loudly and let trigger_rederive
            // recover, rather than surfacing a red event-dispatch error for an asset that
            // uploaded fine.
            _logger.LogError(
                "Failed to enqueue geometry extraction for model {ModelId} version {ModelVersionId} after skipping the thumbnail job ({Reason}): {Error}. " +
                "The model will not appear in search until it is re-derived.",
                domainEvent.ModelId, domainEvent.ModelVersionId, reason, result.Error.Message);
            return Result.Success();
        }

        _logger.LogInformation(
            "Enqueued geometry extraction job {JobId} for model {ModelId} version {ModelVersionId} because the thumbnail job was skipped ({Reason}). AlreadyQueued: {AlreadyQueued}",
            result.Value.JobId, domainEvent.ModelId, domainEvent.ModelVersionId, reason, result.Value.AlreadyQueued);

        return Result.Success();
    }
}
