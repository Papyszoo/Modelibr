using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Services;
using Microsoft.Extensions.Logging;
using SharedKernel;

namespace Application.ThumbnailJobs;

public record FinishEnvironmentMapThumbnailJobCommand(
    int JobId,
    bool Success,
    string? ThumbnailPath = null,
    string? ErrorMessage = null) : ICommand<FinishEnvironmentMapThumbnailJobResponse>;

public record FinishEnvironmentMapThumbnailJobResponse(
    int JobId,
    int EnvironmentMapId,
    int EnvironmentMapVariantId,
    string Status);

public class FinishEnvironmentMapThumbnailJobCommandHandler
    : ICommandHandler<FinishEnvironmentMapThumbnailJobCommand, FinishEnvironmentMapThumbnailJobResponse>
{
    private readonly IThumbnailJobRepository _thumbnailJobRepository;
    private readonly IEnvironmentMapRepository _environmentMapRepository;
    private readonly IThumbnailQueue _thumbnailQueue;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IThumbnailNotificationService _thumbnailNotificationService;
    private readonly ILogger<FinishEnvironmentMapThumbnailJobCommandHandler> _logger;

    public FinishEnvironmentMapThumbnailJobCommandHandler(
        IThumbnailJobRepository thumbnailJobRepository,
        IEnvironmentMapRepository environmentMapRepository,
        IThumbnailQueue thumbnailQueue,
        IDateTimeProvider dateTimeProvider,
        IThumbnailNotificationService thumbnailNotificationService,
        ILogger<FinishEnvironmentMapThumbnailJobCommandHandler> logger)
    {
        _thumbnailJobRepository = thumbnailJobRepository;
        _environmentMapRepository = environmentMapRepository;
        _thumbnailQueue = thumbnailQueue;
        _dateTimeProvider = dateTimeProvider;
        _thumbnailNotificationService = thumbnailNotificationService;
        _logger = logger;
    }

    public async Task<Result<FinishEnvironmentMapThumbnailJobResponse>> Handle(
        FinishEnvironmentMapThumbnailJobCommand command,
        CancellationToken cancellationToken)
    {
        if (command.Success && string.IsNullOrWhiteSpace(command.ThumbnailPath))
        {
            return Result.Failure<FinishEnvironmentMapThumbnailJobResponse>(
                new Error("InvalidCommand", "ThumbnailPath is required when Success is true"));
        }

        if (!command.Success && string.IsNullOrWhiteSpace(command.ErrorMessage))
        {
            return Result.Failure<FinishEnvironmentMapThumbnailJobResponse>(
                new Error("InvalidCommand", "ErrorMessage is required when Success is false"));
        }

        var job = await _thumbnailJobRepository.GetByIdAsync(command.JobId, cancellationToken);
        if (job == null || !job.EnvironmentMapId.HasValue || !job.EnvironmentMapVariantId.HasValue)
        {
            return Result.Failure<FinishEnvironmentMapThumbnailJobResponse>(
                new Error("InvalidJobType", $"Job {command.JobId} is not an environment map thumbnail job"));
        }

        var environmentMap = await _environmentMapRepository.GetByIdAsync(job.EnvironmentMapId.Value, cancellationToken);
        if (environmentMap == null)
        {
            return Result.Failure<FinishEnvironmentMapThumbnailJobResponse>(
                new Error("EnvironmentMapNotFound", $"Environment map with ID {job.EnvironmentMapId.Value} was not found."));
        }

        var variant = environmentMap.GetVariant(job.EnvironmentMapVariantId.Value);
        if (variant == null)
        {
            return Result.Failure<FinishEnvironmentMapThumbnailJobResponse>(
                new Error("EnvironmentMapVariantNotFound", $"Environment map variant with ID {job.EnvironmentMapVariantId.Value} was not found."));
        }

        var now = _dateTimeProvider.UtcNow;

        if (command.Success)
        {
            variant.SetThumbnailPath(command.ThumbnailPath, now);
            await _environmentMapRepository.UpdateAsync(environmentMap, cancellationToken);
            await _thumbnailQueue.MarkCompletedAsync(command.JobId, cancellationToken);
            await SendThumbnailNotificationAsync(environmentMap.Id, variant.Id, "Ready", now, null, cancellationToken);
            _logger.LogInformation("Environment map thumbnail job {JobId} completed for environment map {EnvironmentMapId} variant {VariantId}",
                command.JobId, environmentMap.Id, variant.Id);
        }
        else
        {
            variant.SetThumbnailPath(null, now);
            await _environmentMapRepository.UpdateAsync(environmentMap, cancellationToken);
            await _thumbnailQueue.MarkFailedAsync(command.JobId, command.ErrorMessage!, cancellationToken);
            await SendThumbnailNotificationAsync(environmentMap.Id, variant.Id, "Failed", now, command.ErrorMessage, cancellationToken);
            _logger.LogWarning("Environment map thumbnail job {JobId} failed for environment map {EnvironmentMapId} variant {VariantId}: {ErrorMessage}",
                command.JobId, environmentMap.Id, variant.Id, command.ErrorMessage?.ReplaceLineEndings(" "));
        }

        return Result.Success(new FinishEnvironmentMapThumbnailJobResponse(
            command.JobId,
            environmentMap.Id,
            variant.Id,
            command.Success ? "Completed" : "Failed"));
    }

    private async Task SendThumbnailNotificationAsync(
        int environmentMapId,
        int environmentMapVariantId,
        string status,
        DateTime timestamp,
        string? errorMessage,
        CancellationToken cancellationToken)
    {
        await _thumbnailNotificationService.SendEnvironmentMapThumbnailStatusChangedAsync(
            new EnvironmentMapThumbnailStatusChangedNotification(
                environmentMapId,
                environmentMapVariantId,
                status,
                $"/environment-maps/{environmentMapId}/preview?v={timestamp.Ticks}",
                $"/environment-maps/{environmentMapId}/variants/{environmentMapVariantId}/preview?v={timestamp.Ticks}",
                timestamp,
                errorMessage),
            cancellationToken);
    }
}
