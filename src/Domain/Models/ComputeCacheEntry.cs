namespace Domain.Models;

/// <summary>
/// A cached expensive-compute result (UV overlap, texel density, exact surface
/// area, manifold check, per-part render), keyed on the <b>geometry hash</b> rather
/// than on part identity. A result computed for one instance is instantly available
/// for every copy and across any asset sharing the geometry — the whole point of
/// canonicalising the hash (prompt 21). One row per (GeometryHash, HashVersion,
/// Metric); recompute upserts.
/// </summary>
public class ComputeCacheEntry
{
    public int Id { get; private set; }

    public string GeometryHash { get; private set; } = string.Empty;
    public int GeometryHashVersion { get; private set; }

    /// <summary>Metric name: "uv-overlap", "texel-density", "surface-area", "manifold", "part-render", …</summary>
    public string Metric { get; private set; } = string.Empty;

    /// <summary>Computed result as JSON (jsonb). Interpretation is per-metric.</summary>
    public string Result { get; private set; } = "{}";

    public DateTime ComputedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    public static ComputeCacheEntry Create(
        string geometryHash,
        int geometryHashVersion,
        string metric,
        string result,
        DateTime computedAt)
    {
        if (string.IsNullOrWhiteSpace(geometryHash))
            throw new ArgumentException("Geometry hash cannot be null or whitespace.", nameof(geometryHash));
        if (geometryHashVersion < 1)
            throw new ArgumentException("Geometry hash version must be at least 1.", nameof(geometryHashVersion));
        if (string.IsNullOrWhiteSpace(metric))
            throw new ArgumentException("Metric cannot be null or whitespace.", nameof(metric));

        return new ComputeCacheEntry
        {
            GeometryHash = geometryHash.Trim(),
            GeometryHashVersion = geometryHashVersion,
            Metric = metric.Trim(),
            Result = string.IsNullOrWhiteSpace(result) ? "{}" : result,
            ComputedAt = computedAt,
            UpdatedAt = computedAt
        };
    }

    public void UpdateResult(string result, DateTime updatedAt)
    {
        Result = string.IsNullOrWhiteSpace(result) ? "{}" : result;
        UpdatedAt = updatedAt;
    }
}
