using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using Microsoft.Extensions.Logging;
using SharedKernel;

namespace Application.ThumbnailJobs;

/// <summary>
/// Finishes a texture set thumbnail job (marks as completed or failed).
/// </summary>
public record FinishTextureSetThumbnailJobCommand(
    int JobId,
    bool Success,
    string? ThumbnailPath = null,
    long? SizeBytes = null,
    string? ErrorMessage = null) : ICommand<FinishTextureSetThumbnailJobResponse>;

public record FinishTextureSetThumbnailJobResponse(
    int JobId,
    string Status);

public class FinishTextureSetThumbnailJobCommandHandler
    : ICommandHandler<FinishTextureSetThumbnailJobCommand, FinishTextureSetThumbnailJobResponse>
{
    private readonly IThumbnailJobRepository _thumbnailJobRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly ILogger<FinishTextureSetThumbnailJobCommandHandler> _logger;

    public FinishTextureSetThumbnailJobCommandHandler(
        IThumbnailJobRepository thumbnailJobRepository,
        IDateTimeProvider dateTimeProvider,
        ILogger<FinishTextureSetThumbnailJobCommandHandler> logger)
    {
        _thumbnailJobRepository = thumbnailJobRepository ?? throw new ArgumentNullException(nameof(thumbnailJobRepository));
        _dateTimeProvider = dateTimeProvider ?? throw new ArgumentNullException(nameof(dateTimeProvider));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<Result<FinishTextureSetThumbnailJobResponse>> Handle(
        FinishTextureSetThumbnailJobCommand command,
        CancellationToken cancellationToken)
    {
        var job = await _thumbnailJobRepository.GetByIdAsync(command.JobId, cancellationToken);
        if (job == null)
        {
            return Result.Failure<FinishTextureSetThumbnailJobResponse>(
                new Error("ThumbnailJobNotFound", $"Thumbnail job {command.JobId} not found"));
        }

        if (!job.TextureSetId.HasValue)
        {
            return Result.Failure<FinishTextureSetThumbnailJobResponse>(
                new Error("InvalidJobType", "Job must have TextureSetId. Use the model or sound finish endpoint instead."));
        }

        var now = _dateTimeProvider.UtcNow;

        if (command.Success)
        {
            job.MarkAsCompleted(now);
            _logger.LogInformation("Texture set thumbnail job {JobId} completed for TextureSetId {TextureSetId}",
                command.JobId, job.TextureSetId);
        }
        else
        {
            job.MarkAsFailed(command.ErrorMessage ?? "Unknown error", now);
            _logger.LogWarning("Texture set thumbnail job {JobId} failed for TextureSetId {TextureSetId}: {Error}",
                command.JobId, job.TextureSetId, command.ErrorMessage);
        }

        await _thumbnailJobRepository.UpdateAsync(job, cancellationToken);

        return Result.Success(new FinishTextureSetThumbnailJobResponse(
            command.JobId,
            command.Success ? "Completed" : "Failed"));
    }
}
