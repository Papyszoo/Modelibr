using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Extraction.Compute;

/// <summary>
/// Reads a cached expensive-compute result by geometry hash. Returns the result
/// when present; otherwise reports it as not-yet-computed so the caller (MCP
/// compute_on_demand) can decide whether to wait. Ordinary endpoint - the MCP
/// layer wraps it, no MCP-specific compute path.
/// </summary>
public record GetComputeResultQuery(string GeometryHash, int GeometryHashVersion, string Metric)
    : IQuery<ComputeResultResponse>;

public record ComputeResultResponse(string Status, string? Result);

internal sealed class GetComputeResultQueryHandler
    : IQueryHandler<GetComputeResultQuery, ComputeResultResponse>
{
    private readonly IComputeCacheRepository _repository;

    public GetComputeResultQueryHandler(IComputeCacheRepository repository)
    {
        _repository = repository;
    }

    public async Task<Result<ComputeResultResponse>> Handle(
        GetComputeResultQuery query,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(query.GeometryHash))
        {
            return Result.Failure<ComputeResultResponse>(
                new Error("InvalidGeometryHash", "A geometry hash is required."));
        }
        if (string.IsNullOrWhiteSpace(query.Metric))
        {
            return Result.Failure<ComputeResultResponse>(
                new Error("InvalidMetric", "A metric name is required."));
        }

        var entry = await _repository.GetAsync(
            query.GeometryHash.Trim(),
            query.GeometryHashVersion <= 0 ? 1 : query.GeometryHashVersion,
            query.Metric.Trim(),
            cancellationToken);

        return entry is null
            ? Result.Success(new ComputeResultResponse("pending", null))
            : Result.Success(new ComputeResultResponse("cached", entry.Result));
    }
}
