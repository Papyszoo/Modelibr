using System.Text.Json;
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

        var metric = query.Metric.Trim();
        var entry = await _repository.GetAsync(
            query.GeometryHash.Trim(),
            query.GeometryHashVersion <= 0 ? 1 : query.GeometryHashVersion,
            metric,
            cancellationToken);

        if (entry is null)
        {
            return Result.Success(new ComputeResultResponse("pending", null));
        }

        if (IsLegacySurfaceArea(metric, entry.Result))
        {
            // Reported as pending rather than served, and it is worth being precise about
            // why. Until 2026-08-24 the worker cached the WORLD-space area under a hash
            // computed from LOCAL coordinates - so two instances of one mesh at 1x and 100x
            // shared a row holding one of their two areas, and whichever was measured first
            // was served to the other as fact. The value is a real number and there is
            // nothing in the row that says which instance it belongs to; there is no
            // conversion back, only a recompute. analyze_meshes overwrites the row with a
            // local-space one on the next run.
            return Result.Success(new ComputeResultResponse("pending", null));
        }

        return Result.Success(new ComputeResultResponse("cached", entry.Result));
    }

    /// <summary>
    /// True for a <c>surface-area</c> row written before the metric declared its space.
    /// </summary>
    /// <remarks>
    /// The marker is the presence of <c>"space": "local"</c>, not its absence being
    /// assumed benign - an unmarked row is exactly the one that cannot be trusted. Reading
    /// it costs one small JSON parse on a cache hit, and only for this one metric.
    /// </remarks>
    private static bool IsLegacySurfaceArea(string metric, string? result)
    {
        if (!string.Equals(metric, ComputeMetrics.SurfaceArea, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (string.IsNullOrWhiteSpace(result))
        {
            return true;
        }

        try
        {
            using var document = JsonDocument.Parse(result);
            // Object-shaped or it is not a payload this metric ever wrote - and
            // TryGetProperty throws rather than answering false on anything else.
            return document.RootElement.ValueKind != JsonValueKind.Object ||
                   !document.RootElement.TryGetProperty("space", out var space) ||
                   space.ValueKind != JsonValueKind.String ||
                   !string.Equals(space.GetString(), ComputeMetrics.LocalSpace, StringComparison.OrdinalIgnoreCase);
        }
        catch (JsonException)
        {
            // Unparseable is not servable either.
            return true;
        }
    }
}

/// <summary>
/// Names shared between the compute cache's readers and the tools that describe it.
/// </summary>
public static class ComputeMetrics
{
    public const string SurfaceArea = "surface-area";
    public const string Manifold = "manifold";

    /// <summary>
    /// The value <c>surface-area</c> rows carry in their <c>space</c> field.
    ///
    /// <para>
    /// Local, and only ever local, because the cache is keyed by a geometry hash computed
    /// from local vertex coordinates - two instances of one mesh at different scales hash
    /// identically. World-space area is a function of the transform as well as the
    /// geometry, so it belongs on the job that measured a particular object, never in a row
    /// shared by every asset with that geometry.
    /// </para>
    /// </summary>
    public const string LocalSpace = "local";
}
