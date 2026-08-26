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
/// It <b>always</b> queues a Geometry extraction job as well. Scene-graph extraction rides
/// on the thumbnail render (the worker's thumbnail processor is what calls
/// <c>saveSceneGraph</c>), which made "indexed" wait for "rendered" in two different ways.
/// </para>
///
/// <para>
/// It made skipping the render mean never indexing at all: no parts, no technical metadata,
/// no search document. A store import attaches the store's own turntable and took exactly
/// that path - the imported model existed with a picture and could not be found by
/// <c>search_assets</c>.
/// </para>
///
/// <para>
/// And when the render was <i>not</i> skipped it put becoming searchable at the back of the
/// thumbnail queue, which on a 1,700-model import is hours. A turntable render plus frame
/// encoding is orders of magnitude more work than walking a scene graph, so the two belong
/// in different queues with different budgets - which they already are, and nothing was
/// using it. An asset now becomes findable while its picture is still rendering.
/// </para>
///
/// <para>
/// The cost is that a fresh import walks its scene graph twice, once per queue. Both writes
/// are full replaces of the same derived rows from the same file, so the second is
/// redundant rather than wrong; if the two ever land at the same instant one transaction
/// loses and its job retries, which is what both queues already do under contention. The
/// alternative - teaching the thumbnail path to skip an extraction that already exists -
/// would silently disable <c>trigger_rederive</c>, whose whole purpose is to redo an
/// extraction whose inputs did not change.
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

            // Indexing first, unconditionally: it is the cheap half, and it is what decides
            // whether the asset can be found at all.
            await EnqueueGeometryExtractionAsync(domainEvent, "every upload is indexed", cancellationToken);

            // The upload itself may opt out (e.g. a store import that attaches the store's
            // already-rendered turntable) - don't queue a redundant render.
            if (!domainEvent.GenerateThumbnail)
            {
                _logger.LogInformation("Skipping thumbnail job enqueue for model {ModelId} version {ModelVersionId} - the upload supplied its own thumbnail.",
                    domainEvent.ModelId, domainEvent.ModelVersionId);
                return Result.Success();
            }

            var settings = await _settingsService.GetSettingsAsync(cancellationToken);
            if (!settings.GenerateThumbnailOnUpload)
            {
                _logger.LogInformation("Skipping thumbnail job enqueue for model {ModelId} version {ModelVersionId} - GenerateThumbnailOnUpload is disabled.",
                    domainEvent.ModelId, domainEvent.ModelVersionId);
                return Result.Success();
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
    /// Queues the Geometry extraction that makes the model searchable - parts, technical
    /// metadata and a search document - independently of whether a picture is being
    /// rendered for it. Deduped by the queue, so a re-upload of the same version is a no-op.
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
                "Failed to enqueue geometry extraction for model {ModelId} version {ModelVersionId} ({Reason}): {Error}. " +
                "The model will not appear in search until a thumbnail render or a re-derive indexes it.",
                domainEvent.ModelId, domainEvent.ModelVersionId, reason, result.Error.Message);
            return Result.Success();
        }

        _logger.LogInformation(
            "Enqueued geometry extraction job {JobId} for model {ModelId} version {ModelVersionId} ({Reason}). AlreadyQueued: {AlreadyQueued}",
            result.Value.JobId, domainEvent.ModelId, domainEvent.ModelVersionId, reason, result.Value.AlreadyQueued);

        return Result.Success();
    }
}
