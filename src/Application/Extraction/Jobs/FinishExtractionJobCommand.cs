using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Extraction.Jobs;

/// <summary>
/// Reports the outcome of a claimed extraction job. Success marks it Done (with optional
/// partial-run warning detail); failure records the error and either re-queues (attempts
/// left) or dead-letters - the retry/dead-letter transition lives on the entity.
///
/// The reporting worker must still hold the claim. Without that check a worker whose
/// lease had expired - and whose job another worker had since re-claimed and possibly
/// already finished - could come back and overwrite the newer outcome with its own stale
/// one, marking a job Done that the current run never completed.
/// </summary>
internal sealed class FinishExtractionJobCommandHandler
    : ICommandHandler<FinishExtractionJobCommand>
{
    private readonly IExtractionJobRepository _repository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public FinishExtractionJobCommandHandler(
        IExtractionJobRepository repository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _repository = repository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(FinishExtractionJobCommand command, CancellationToken cancellationToken)
    {
        var job = await _repository.GetByIdAsync(command.JobId, cancellationToken);
        if (job is null)
        {
            return Result.Failure(new Error("ExtractionJobNotFound", $"Extraction job {command.JobId} was not found."));
        }

        if (string.IsNullOrWhiteSpace(command.WorkerId))
        {
            return Result.Failure(new Error(
                "InvalidWorkerId", "The worker id that claimed the job is required to finish it."));
        }

        if (job.Status != ExtractionJobStatus.Processing)
        {
            return Result.Failure(new Error(
                "ExtractionJobNotClaimed",
                $"Extraction job {command.JobId} is {job.Status}, not Processing - there is no claim to report against."));
        }

        if (!string.Equals(job.LockedBy, command.WorkerId.Trim(), StringComparison.Ordinal))
        {
            // The lease lapsed and someone else owns the job now. Report it, but never
            // let this result land: it describes a run that is no longer authoritative.
            return Result.Failure(new Error(
                "ExtractionJobLeaseLost",
                $"Extraction job {command.JobId} is now claimed by '{job.LockedBy}'; this worker's lease expired."));
        }

        var now = _dateTimeProvider.UtcNow;
        if (command.Success)
        {
            job.MarkAsCompleted(now, command.WarningDetail, command.ResultJson);
        }
        else
        {
            job.MarkAsFailed(
                string.IsNullOrWhiteSpace(command.ErrorMessage) ? "Extraction failed." : command.ErrorMessage,
                now);
        }

        await _repository.UpdateAsync(job, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}

/// <param name="ResultJson">
/// What an operation produced, for the operations that produce something - the version an
/// unwrap wrote, the texture set a bake imported. Ignored on failure and absent for a
/// re-derive, which has no outcome to name beyond having run.
/// </param>
public record FinishExtractionJobCommand(
    int JobId,
    string WorkerId,
    bool Success,
    string? ErrorMessage = null,
    string? WarningDetail = null,
    string? ResultJson = null) : ICommand;
