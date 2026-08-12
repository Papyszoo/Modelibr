using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Extraction.Jobs;

/// <summary>
/// Enqueues a decoupled extraction job (prompt 20). Deduped: re-queuing a target that
/// already has a live (Pending/Processing) job in the same family is a no-op - the
/// caller gets the existing job id. Powers <c>trigger_rederive</c> and on-demand compute.
/// </summary>
internal sealed class EnqueueExtractionJobCommandHandler
    : ICommandHandler<EnqueueExtractionJobCommand, EnqueueExtractionJobResponse>
{
    private readonly IExtractionJobRepository _repository;
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public EnqueueExtractionJobCommandHandler(
        IExtractionJobRepository repository,
        IModelVersionRepository modelVersionRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _repository = repository;
        _modelVersionRepository = modelVersionRepository;
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

        var assetType = command.AssetType.Trim();
        var family = string.IsNullOrWhiteSpace(command.ExtractorFamily)
            ? ExtractorFamilies.Geometry
            : command.ExtractorFamily.Trim();

        // Models are versioned, and everything the worker writes back - scene graph,
        // technical metadata, search documents - is keyed by version. A job queued
        // without one is silently useless: the worker downloads the file, extracts it,
        // fails both save calls with a 400, and still reports the job completed, so a
        // re-derive looks like it worked while the index never changes. Resolve the
        // model's latest version here rather than letting a caller omit it.
        var versionId = command.VersionId;
        if (versionId is null && string.Equals(assetType, "Model", StringComparison.OrdinalIgnoreCase))
        {
            var versions = await _modelVersionRepository.GetByModelIdAsync(command.AssetId, cancellationToken);
            var current = versions.OrderByDescending(v => v.VersionNumber).FirstOrDefault();
            if (current is null)
            {
                return Result.Failure<EnqueueExtractionJobResponse>(
                    new Error("ModelVersionNotFound", $"Model {command.AssetId} has no version to re-derive."));
            }
            versionId = current.Id;
        }

        var existing = await _repository.GetLiveJobAsync(
            assetType, command.AssetId, versionId, family, cancellationToken);
        if (existing is not null)
        {
            return Result.Success(new EnqueueExtractionJobResponse(existing.Id, AlreadyQueued: true));
        }

        ExtractionJob job;
        try
        {
            job = ExtractionJob.Create(
                assetType, command.AssetId, family, _dateTimeProvider.UtcNow,
                versionId: versionId, fileSha256: command.FileSha256);
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
