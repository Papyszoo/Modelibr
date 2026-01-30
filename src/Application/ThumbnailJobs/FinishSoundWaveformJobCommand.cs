using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Services;
using Microsoft.Extensions.Logging;
using SharedKernel;

namespace Application.ThumbnailJobs;

/// <summary>
/// Command to finish a sound waveform job (either completed or failed).
/// Called by the worker service when waveform generation finishes.
/// </summary>
public record FinishSoundWaveformJobCommand(
    int JobId,
    bool Success,
    // Success fields (nullable - required when Success=true)
    string? WaveformPath,
    long? SizeBytes,
    // Failure fields (nullable - required when Success=false)
    string? ErrorMessage) : ICommand<FinishSoundWaveformJobResponse>;

public record FinishSoundWaveformJobResponse(int JobId, string Status);

/// <summary>
/// Handler for finishing sound waveform jobs.
/// </summary>
public class FinishSoundWaveformJobCommandHandler : ICommandHandler<FinishSoundWaveformJobCommand, FinishSoundWaveformJobResponse>
{
    private readonly IThumbnailJobRepository _thumbnailJobRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly ILogger<FinishSoundWaveformJobCommandHandler> _logger;

    public FinishSoundWaveformJobCommandHandler(
        IThumbnailJobRepository thumbnailJobRepository,
        IDateTimeProvider dateTimeProvider,
        ILogger<FinishSoundWaveformJobCommandHandler> logger)
    {
        _thumbnailJobRepository = thumbnailJobRepository ?? throw new ArgumentNullException(nameof(thumbnailJobRepository));
        _dateTimeProvider = dateTimeProvider ?? throw new ArgumentNullException(nameof(dateTimeProvider));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<Result<FinishSoundWaveformJobResponse>> Handle(FinishSoundWaveformJobCommand command, CancellationToken cancellationToken)
    {
        // Validate command
        if (command.Success)
        {
            if (string.IsNullOrEmpty(command.WaveformPath))
            {
                return Result.Failure<FinishSoundWaveformJobResponse>(
                    new Error("InvalidCommand", "WaveformPath is required when Success is true"));
            }
        }
        else
        {
            if (string.IsNullOrEmpty(command.ErrorMessage))
            {
                return Result.Failure<FinishSoundWaveformJobResponse>(
                    new Error("InvalidCommand", "ErrorMessage is required when Success is false"));
            }
        }

        // Get the job
        var job = await _thumbnailJobRepository.GetByIdAsync(command.JobId, cancellationToken);
        if (job == null)
        {
            _logger.LogWarning("Sound waveform job {JobId} not found", command.JobId);
            return Result.Failure<FinishSoundWaveformJobResponse>(
                new Error("JobNotFound", $"Sound waveform job {command.JobId} not found"));
        }

        // Verify this is a sound job
        if (!job.SoundId.HasValue)
        {
            _logger.LogWarning("Job {JobId} is not a sound waveform job (SoundId is null)", command.JobId);
            return Result.Failure<FinishSoundWaveformJobResponse>(
                new Error("InvalidJobType", $"Job {command.JobId} is not a sound waveform job"));
        }

        var now = _dateTimeProvider.UtcNow;

        // Mark job as completed or failed
        if (command.Success)
        {
            job.MarkAsCompleted(now);
            _logger.LogInformation("Sound waveform job {JobId} completed successfully (SoundId: {SoundId}, Path: {Path})",
                command.JobId, job.SoundId.Value, command.WaveformPath);
        }
        else
        {
            job.MarkAsFailed(command.ErrorMessage ?? "Unknown error", now);
            _logger.LogWarning("Sound waveform job {JobId} failed (SoundId: {SoundId}, Error: {Error})",
                command.JobId, job.SoundId.Value, command.ErrorMessage);
        }

        await _thumbnailJobRepository.UpdateAsync(job, cancellationToken);

        return Result.Success(new FinishSoundWaveformJobResponse(
            command.JobId,
            command.Success ? "Completed" : "Failed"));
    }
}
