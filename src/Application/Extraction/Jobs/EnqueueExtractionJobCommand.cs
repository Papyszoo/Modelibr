using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Extraction.Jobs;

/// <summary>
/// Enqueues a decoupled extraction job (prompt 20). Deduped: re-queuing a target that
/// already has a live (Pending/Processing) job in the same family is a no-op — the
/// caller gets the existing job id. Powers <c>trigger_rederive</c> and on-demand compute.
/// </summary>
internal sealed class EnqueueExtractionJobCommandHandler
    : ICommandHandler<EnqueueExtractionJobCommand, EnqueueExtractionJobResponse>
{
    private readonly IExtractionJobRepository _repository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public EnqueueExtractionJobCommandHandler(
        IExtractionJobRepository repository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _repository = repository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<EnqueueExtractionJobResponse>> Handle(
        EnqueueExtractionJobCommand command,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(command.AssetType) || command.AssetId <= 0)
        {
            return Result.Failure<EnqueueExtractionJobResponse>(
                new Error("InvalidExtractionTarget", "A valid asset type and id are required."));
        }

        var family = string.IsNullOrWhiteSpace(command.ExtractorFamily)
            ? ExtractorFamilies.Geometry
            : command.ExtractorFamily.Trim();

        var existing = await _repository.GetLiveJobAsync(
            command.AssetType.Trim(), command.AssetId, command.VersionId, family, cancellationToken);
        if (existing is not null)
        {
            return Result.Success(new EnqueueExtractionJobResponse(existing.Id, AlreadyQueued: true));
        }

        ExtractionJob job;
        try
        {
            job = ExtractionJob.Create(
                command.AssetType.Trim(), command.AssetId, family, _dateTimeProvider.UtcNow,
                versionId: command.VersionId, fileSha256: command.FileSha256);
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<EnqueueExtractionJobResponse>(new Error("InvalidExtractionJob", ex.Message));
        }

        await _repository.AddAsync(job, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(new EnqueueExtractionJobResponse(job.Id, AlreadyQueued: false));
    }
}

public record EnqueueExtractionJobCommand(
    string AssetType,
    int AssetId,
    int? VersionId = null,
    string? ExtractorFamily = null,
    string? FileSha256 = null) : ICommand<EnqueueExtractionJobResponse>;

public record EnqueueExtractionJobResponse(int JobId, bool AlreadyQueued);
