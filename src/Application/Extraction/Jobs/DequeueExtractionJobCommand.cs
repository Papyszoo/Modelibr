using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using Microsoft.Extensions.Logging;
using SharedKernel;

namespace Application.Extraction.Jobs;

/// <summary>
/// Claims the next runnable extraction job in a family for a worker. The claim is a
/// single atomic UPDATE (<see cref="IExtractionJobRepository.TryClaimJobAsync"/>); if a
/// racing worker wins the row, this retries the next claimable job a few times before
/// reporting that the queue is empty. Mirrors the thumbnail dequeue.
/// </summary>
internal sealed class DequeueExtractionJobCommandHandler
    : ICommandHandler<DequeueExtractionJobCommand, DequeueExtractionJobResponse>
{
    private const int MaxClaimAttempts = 5;

    private readonly IExtractionJobRepository _repository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly ILogger<DequeueExtractionJobCommandHandler> _logger;

    public DequeueExtractionJobCommandHandler(
        IExtractionJobRepository repository,
        IDateTimeProvider dateTimeProvider,
        ILogger<DequeueExtractionJobCommandHandler> logger)
    {
        _repository = repository;
        _dateTimeProvider = dateTimeProvider;
        _logger = logger;
    }

    public async Task<Result<DequeueExtractionJobResponse>> Handle(
        DequeueExtractionJobCommand command,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(command.WorkerId))
        {
            return Result.Failure<DequeueExtractionJobResponse>(
                new Error("InvalidWorkerId", "A worker id is required to dequeue."));
        }

        var family = string.IsNullOrWhiteSpace(command.ExtractorFamily)
            ? ExtractorFamilies.Geometry
            : command.ExtractorFamily.Trim();
        var workerId = command.WorkerId.Trim();

        // Retire jobs whose worker died on its last permitted attempt. Nothing will
        // re-claim them (claiming requires attempts left) and nothing will report their
        // failure, so without this they sit in Processing forever.
        var retired = await _repository.DeadLetterExhaustedJobsAsync(
            family, _dateTimeProvider.UtcNow, cancellationToken);
        if (retired > 0)
        {
            _logger.LogWarning(
                "Dead-lettered {Count} extraction job(s) in family {Family} whose lease expired with no attempts left",
                retired, family);
        }

        for (var attempt = 0; attempt < MaxClaimAttempts; attempt++)
        {
            var now = _dateTimeProvider.UtcNow;
            var candidate = await _repository.GetNextClaimableJobAsync(family, now, cancellationToken);
            if (candidate is null)
            {
                return Result.Success(new DequeueExtractionJobResponse(null));
            }

            var won = await _repository.TryClaimJobAsync(candidate.Id, workerId, now, cancellationToken);
            if (!won)
            {
                continue; // a racing worker claimed it — try the next candidate
            }

            var claimed = await _repository.GetByIdAsync(candidate.Id, cancellationToken);
            _logger.LogInformation(
                "Worker {WorkerId} claimed extraction job {JobId} ({AssetType} {AssetId})",
                workerId, candidate.Id, candidate.AssetType, candidate.AssetId);
            return Result.Success(new DequeueExtractionJobResponse(
                claimed is null ? null : ExtractionJobDto.From(claimed)));
        }

        // Lost every race this round; the worker will poll again.
        return Result.Success(new DequeueExtractionJobResponse(null));
    }
}

public record DequeueExtractionJobCommand(string WorkerId, string? ExtractorFamily = null)
    : ICommand<DequeueExtractionJobResponse>;

public record DequeueExtractionJobResponse(ExtractionJobDto? Job);

/// <summary>The claimed job, projected to the fields the worker needs to run it.</summary>
public record ExtractionJobDto(
    int Id,
    string AssetType,
    int AssetId,
    int? VersionId,
    string? FileSha256,
    string ExtractorFamily,
    int AttemptCount,
    int MaxAttempts)
{
    public static ExtractionJobDto From(Domain.Models.ExtractionJob job) =>
        new(job.Id, job.AssetType, job.AssetId, job.VersionId, job.FileSha256,
            job.ExtractorFamily, job.AttemptCount, job.MaxAttempts);
}
