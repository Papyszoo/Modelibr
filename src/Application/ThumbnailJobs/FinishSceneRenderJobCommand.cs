using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using Microsoft.Extensions.Logging;
using SharedKernel;

namespace Application.ThumbnailJobs;

/// <summary>
/// Closes out a scene render job. Its own endpoint for the same reason texture sets and
/// environment maps have theirs: the model finish handler resolves a Thumbnail for a model
/// version and answers with a ModelId, which a scene job has none of.
/// </summary>
public record FinishSceneRenderJobCommand(
    int JobId,
    bool Success,
    string? ErrorMessage) : ICommand<FinishSceneRenderJobResponse>;

public record FinishSceneRenderJobResponse(int JobId, int SceneId, string Status);

public class FinishSceneRenderJobCommandHandler : ICommandHandler<FinishSceneRenderJobCommand, FinishSceneRenderJobResponse>
{
    private readonly IThumbnailJobRepository _thumbnailJobRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly ILogger<FinishSceneRenderJobCommandHandler> _logger;
    private readonly IUnitOfWork _unitOfWork;

    public FinishSceneRenderJobCommandHandler(
        IThumbnailJobRepository thumbnailJobRepository,
        IDateTimeProvider dateTimeProvider,
        ILogger<FinishSceneRenderJobCommandHandler> logger,
        IUnitOfWork unitOfWork)
    {
        _thumbnailJobRepository = thumbnailJobRepository;
        _dateTimeProvider = dateTimeProvider;
        _logger = logger;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<FinishSceneRenderJobResponse>> Handle(
        FinishSceneRenderJobCommand command,
        CancellationToken cancellationToken)
    {
        var job = await _thumbnailJobRepository.GetByIdAsync(command.JobId, cancellationToken);
        if (job == null)
        {
            return Result.Failure<FinishSceneRenderJobResponse>(
                new Error("ThumbnailJobNotFound", $"Thumbnail job {command.JobId} not found"));
        }

        if (job.AssetType != "Scene" || !job.SceneId.HasValue)
        {
            return Result.Failure<FinishSceneRenderJobResponse>(
                new Error("InvalidJobType", $"Job {command.JobId} is a {job.AssetType} job. Use that asset type's finish endpoint instead."));
        }

        var now = _dateTimeProvider.UtcNow;

        if (command.Success)
        {
            job.MarkAsCompleted(now);
            _logger.LogInformation("Scene render job {JobId} completed for SceneId {SceneId}",
                command.JobId, job.SceneId);
        }
        else
        {
            job.MarkAsFailed(command.ErrorMessage ?? "Scene render failed", now);
            _logger.LogWarning("Scene render job {JobId} failed for SceneId {SceneId}: {Error}",
                command.JobId, job.SceneId, command.ErrorMessage);
        }

        await _thumbnailJobRepository.UpdateAsync(job, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(new FinishSceneRenderJobResponse(job.Id, job.SceneId.Value, job.Status.ToString()));
    }
}
