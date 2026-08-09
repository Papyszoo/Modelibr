using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Extraction.Jobs;

/// <summary>
/// Reports the outcome of a claimed extraction job. Success marks it Done (with optional
/// partial-run warning detail); failure records the error and either re-queues (attempts
/// left) or dead-letters — the retry/dead-letter transition lives on the entity.
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

        var now = _dateTimeProvider.UtcNow;
        if (command.Success)
        {
            job.MarkAsCompleted(now, command.WarningDetail);
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

public record FinishExtractionJobCommand(
    int JobId,
    bool Success,
    string? ErrorMessage = null,
    string? WarningDetail = null) : ICommand;
