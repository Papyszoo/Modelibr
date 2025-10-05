using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using Microsoft.Extensions.Logging;
using SharedKernel;

namespace Application.ThumbnailJobs;

/// <summary>
/// Command to log a detailed event for a thumbnail job.
/// Called by the worker service to create an audit trail of job processing.
/// </summary>
public record LogThumbnailJobEventCommand(
    int JobId,
    string EventType,
    string Message,
    string? Metadata = null,
    string? ErrorMessage = null) : ICommand<LogThumbnailJobEventResponse>;

public record LogThumbnailJobEventResponse(int EventId);

/// <summary>
/// Handler for logging thumbnail job events.
/// </summary>
public class LogThumbnailJobEventCommandHandler : ICommandHandler<LogThumbnailJobEventCommand, LogThumbnailJobEventResponse>
{
    private readonly IThumbnailJobEventRepository _thumbnailJobEventRepository;
    private readonly IThumbnailJobRepository _thumbnailJobRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly ILogger<LogThumbnailJobEventCommandHandler> _logger;

    public LogThumbnailJobEventCommandHandler(
        IThumbnailJobEventRepository thumbnailJobEventRepository,
        IThumbnailJobRepository thumbnailJobRepository,
        IDateTimeProvider dateTimeProvider,
        ILogger<LogThumbnailJobEventCommandHandler> logger)
    {
        _thumbnailJobEventRepository = thumbnailJobEventRepository ?? throw new ArgumentNullException(nameof(thumbnailJobEventRepository));
        _thumbnailJobRepository = thumbnailJobRepository ?? throw new ArgumentNullException(nameof(thumbnailJobRepository));
        _dateTimeProvider = dateTimeProvider ?? throw new ArgumentNullException(nameof(dateTimeProvider));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task<Result<LogThumbnailJobEventResponse>> Handle(LogThumbnailJobEventCommand command, CancellationToken cancellationToken)
    {
        // Verify the job exists
        var job = await _thumbnailJobRepository.GetByIdAsync(command.JobId, cancellationToken);
        if (job == null)
        {
            _logger.LogWarning("Thumbnail job {JobId} not found for event logging", command.JobId);
            return Result.Failure<LogThumbnailJobEventResponse>(
                new Error("ThumbnailJobNotFound", $"Thumbnail job {command.JobId} not found"));
        }

        var now = _dateTimeProvider.UtcNow;

        try
        {
            // Create the event
            var jobEvent = ThumbnailJobEvent.Create(
                command.JobId,
                command.EventType,
                command.Message,
                now,
                command.Metadata,
                command.ErrorMessage);

            // Save the event
            var savedEvent = await _thumbnailJobEventRepository.AddAsync(jobEvent, cancellationToken);

            _logger.LogInformation("Logged event {EventType} for thumbnail job {JobId}", 
                command.EventType, command.JobId);

            return Result.Success(new LogThumbnailJobEventResponse(savedEvent.Id));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to log event for thumbnail job {JobId}", command.JobId);

            return Result.Failure<LogThumbnailJobEventResponse>(
                new Error("EventLoggingFailed", 
                    $"Failed to log event for thumbnail job {command.JobId}: {ex.Message}"));
        }
    }
}
