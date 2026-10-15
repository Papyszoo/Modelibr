using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using Microsoft.Extensions.Logging;
using SharedKernel;

namespace Application.ThumbnailJobs;

/// <summary>
/// Finishes a vfx thumbnail job (marks as completed or failed). The picture itself arrived
/// earlier through the vfx thumbnail upload, so this only closes the job.
/// </summary>
public record FinishVfxThumbnailJobCommand(
    int JobId,
    bool Success,
    string? ErrorMessage = null) : ICommand<FinishVfxThumbnailJobResponse>;

public record FinishVfxThumbnailJobResponse(
    int JobId,
    int VfxId,
    string Status);

public class FinishVfxThumbnailJobCommandHandler
    : ICommandHandler<FinishVfxThumbnailJobCommand, FinishVfxThumbnailJobResponse>
{
    private readonly IThumbnailJobRepository _thumbnailJobRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly ILogger<FinishVfxThumbnailJobCommandHandler> _logger;
    private readonly IUnitOfWork _unitOfWork;

    public FinishVfxThumbnailJobCommandHandler(
        IThumbnailJobRepository thumbnailJobRepository,
        IDateTimeProvider dateTimeProvider,
        ILogger<FinishVfxThumbnailJobCommandHandler> logger,
        IUnitOfWork unitOfWork)
    {
        _thumbnailJobRepository = thumbnailJobRepository ?? throw new ArgumentNullException(nameof(thumbnailJobRepository));
        _dateTimeProvider = dateTimeProvider ?? throw new ArgumentNullException(nameof(dateTimeProvider));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<FinishVfxThumbnailJobResponse>> Handle(
        FinishVfxThumbnailJobCommand command,
        CancellationToken cancellationToken)
    {
        var job = await _thumbnailJobRepository.GetByIdAsync(command.JobId, cancellationToken);
        if (job == null)
        {
            return Result.Failure<FinishVfxThumbnailJobResponse>(
                new Error("ThumbnailJobNotFound", $"Thumbnail job {command.JobId} not found"));
        }

        if (!job.VfxId.HasValue)
        {
            return Result.Failure<FinishVfxThumbnailJobResponse>(
                new Error("InvalidJobType", "Job must have VfxId. Use the finish endpoint for its own asset type instead."));
        }

        var now = _dateTimeProvider.UtcNow;

        if (command.Success)
        {
            job.MarkAsCompleted(now);
            _logger.LogInformation("Vfx thumbnail job {JobId} completed for VfxId {VfxId}", command.JobId, job.VfxId);
        }
        else
        {
            job.MarkAsFailed(command.ErrorMessage ?? "Unknown error", now);
            _logger.LogWarning("Vfx thumbnail job {JobId} failed for VfxId {VfxId}", command.JobId, job.VfxId);
        }

        await _thumbnailJobRepository.UpdateAsync(job, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(new FinishVfxThumbnailJobResponse(
            command.JobId,
            job.VfxId.Value,
            command.Success ? "Completed" : "Failed"));
    }
}
