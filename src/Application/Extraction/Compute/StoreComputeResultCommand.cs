using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Extraction.Compute;

/// <summary>
/// Worker-facing upsert of a computed expensive-metric result into the hash-keyed
/// cache. The worker computes UV overlap / texel density / a per-part render and
/// posts it here; it's then instantly available for every asset sharing the hash.
/// </summary>
public record StoreComputeResultCommand(
    string GeometryHash,
    int GeometryHashVersion,
    string Metric,
    string ResultJson) : ICommand;

internal sealed class StoreComputeResultCommandHandler : ICommandHandler<StoreComputeResultCommand>
{
    private readonly IComputeCacheRepository _repository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public StoreComputeResultCommandHandler(
        IComputeCacheRepository repository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _repository = repository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(StoreComputeResultCommand command, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(command.GeometryHash))
        {
            return Result.Failure(new Error("InvalidGeometryHash", "A geometry hash is required."));
        }
        if (string.IsNullOrWhiteSpace(command.Metric))
        {
            return Result.Failure(new Error("InvalidMetric", "A metric name is required."));
        }

        var hashVersion = command.GeometryHashVersion <= 0 ? 1 : command.GeometryHashVersion;
        var now = _dateTimeProvider.UtcNow;

        var existing = await _repository.GetAsync(
            command.GeometryHash.Trim(), hashVersion, command.Metric.Trim(), cancellationToken);

        if (existing is null)
        {
            var entry = ComputeCacheEntry.Create(
                command.GeometryHash.Trim(), hashVersion, command.Metric.Trim(), command.ResultJson, now);
            await _repository.AddAsync(entry, cancellationToken);
        }
        else
        {
            existing.UpdateResult(command.ResultJson, now);
            await _repository.UpdateAsync(existing, cancellationToken);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
