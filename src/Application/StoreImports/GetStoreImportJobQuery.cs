using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.StoreImports;

public record GetStoreImportJobQuery(int JobId) : IQuery<StoreImportJobDto>;

public record StoreImportJobDto(
    int Id,
    string Status,
    int? PackId,
    string StoreAssetId,
    int ManifestSchemaVersion,
    int ItemsTotal,
    int ItemsCreated,
    int ItemsSkipped,
    int ItemsFailed,
    string? ResultJson,
    string? ErrorMessage,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? CompletedAt);

internal sealed class GetStoreImportJobQueryHandler : IQueryHandler<GetStoreImportJobQuery, StoreImportJobDto>
{
    private readonly IStoreImportJobRepository _jobRepository;

    public GetStoreImportJobQueryHandler(IStoreImportJobRepository jobRepository)
    {
        _jobRepository = jobRepository;
    }

    public async Task<Result<StoreImportJobDto>> Handle(GetStoreImportJobQuery query, CancellationToken cancellationToken)
    {
        var job = await _jobRepository.GetByIdAsync(query.JobId, cancellationToken);
        if (job is null)
        {
            return Result.Failure<StoreImportJobDto>(
                new Error("StoreImportJobNotFound", $"Store import job with ID {query.JobId} was not found."));
        }

        // The store URL is intentionally omitted from the DTO (it can carry sensitive host
        // details); the token was never stored to begin with.
        return Result.Success(new StoreImportJobDto(
            job.Id,
            job.Status.ToString(),
            job.PackId,
            job.StoreAssetId,
            job.ManifestSchemaVersion,
            job.ItemsTotal,
            job.ItemsCreated,
            job.ItemsSkipped,
            job.ItemsFailed,
            job.ResultJson,
            job.ErrorMessage,
            job.CreatedAt,
            job.UpdatedAt,
            job.CompletedAt));
    }
}
