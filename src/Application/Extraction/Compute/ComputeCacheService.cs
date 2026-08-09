using Application.Abstractions;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;

namespace Application.Extraction.Compute;

/// <summary>
/// Read-through cache for expensive compute, keyed on the geometry hash. The first
/// asset to request a metric pays for it; every later asset that shares the same
/// geometry hash gets the stored result without recomputing — this is what makes
/// per-part renders and UV/texel analysis affordable across a kit scene.
/// </summary>
public sealed class ComputeCacheService
{
    private readonly IComputeCacheRepository _repository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public ComputeCacheService(
        IComputeCacheRepository repository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _repository = repository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    /// <summary>
    /// Returns the cached result for (hash, version, metric), or runs
    /// <paramref name="compute"/> exactly once, stores it, and returns it. A second
    /// call for the same key — even from a different asset — is a pure cache hit.
    /// </summary>
    public async Task<ComputeCacheEntry> GetOrComputeAsync(
        string geometryHash,
        int geometryHashVersion,
        string metric,
        Func<CancellationToken, Task<string>> compute,
        CancellationToken cancellationToken = default)
    {
        var existing = await _repository.GetAsync(geometryHash, geometryHashVersion, metric, cancellationToken);
        if (existing is not null)
        {
            return existing;
        }

        var resultJson = await compute(cancellationToken);
        var entry = ComputeCacheEntry.Create(
            geometryHash, geometryHashVersion, metric, resultJson, _dateTimeProvider.UtcNow);
        await _repository.AddAsync(entry, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return entry;
    }
}
