namespace Domain.Models;

/// <summary>
/// One object within a composite asset's scene graph (a mesh, group, bone, …),
/// addressed by its <see cref="PartPath"/>. This is what makes sub-parts findable
/// rather than only whole files. Re-extraction fully replaces an asset+version's
/// parts, so the row is write-once per extraction (no in-place mutation methods).
///
/// Queryable facts are promoted to columns; the rest of the per-part detail
/// (transform, uv bounds, material slots, shape keys, and the native-only fields
/// a bpy pass fills) lives verbatim in <see cref="Detail"/> as jsonb.
/// </summary>
public class AssetPart
{
    public int Id { get; private set; }

    public string AssetType { get; private set; } = string.Empty;
    public int AssetId { get; private set; }
    public int? VersionId { get; private set; }

    /// <summary>Stable address within the scene graph (see the worker's partPath spec).</summary>
    public string PartPath { get; private set; } = string.Empty;

    public string Name { get; private set; } = string.Empty;
    public string? ParentPath { get; private set; }
    public int Depth { get; private set; }

    /// <summary>"mesh", "group", "bone", "light", … (worker classifyObjectType).</summary>
    public string ObjectType { get; private set; } = string.Empty;

    public int? TriangleCount { get; private set; }
    public int? VertexCount { get; private set; }

    /// <summary>Order-invariant geometry hash (meshes only) - the dedup / instance / cache key.</summary>
    public string? GeometryHash { get; private set; }
    public int? GeometryHashVersion { get; private set; }

    public bool? HasUvs { get; private set; }

    /// <summary>Remaining per-part detail as JSON (jsonb): transform, uvBounds, materialSlots, shapeKeys, native fields.</summary>
    public string? Detail { get; private set; }

    public DateTime CreatedAt { get; private set; }

    public static AssetPart Create(
        string assetType,
        int assetId,
        int? versionId,
        string partPath,
        string name,
        int depth,
        string objectType,
        DateTime createdAt,
        string? parentPath = null,
        int? triangleCount = null,
        int? vertexCount = null,
        string? geometryHash = null,
        int? geometryHashVersion = null,
        bool? hasUvs = null,
        string? detail = null)
    {
        if (string.IsNullOrWhiteSpace(assetType))
            throw new ArgumentException("Asset type cannot be null or whitespace.", nameof(assetType));
        if (assetId <= 0)
            throw new ArgumentException("Asset id must be greater than 0.", nameof(assetId));
        if (versionId.HasValue && versionId.Value <= 0)
            throw new ArgumentException("Version id must be greater than 0 when provided.", nameof(versionId));
        if (string.IsNullOrWhiteSpace(partPath))
            throw new ArgumentException("Part path cannot be null or whitespace.", nameof(partPath));
        if (string.IsNullOrWhiteSpace(objectType))
            throw new ArgumentException("Object type cannot be null or whitespace.", nameof(objectType));
        if (depth < 0)
            throw new ArgumentException("Depth cannot be negative.", nameof(depth));

        return new AssetPart
        {
            AssetType = assetType.Trim(),
            AssetId = assetId,
            VersionId = versionId,
            PartPath = partPath.Trim(),
            Name = name ?? string.Empty,
            ParentPath = string.IsNullOrWhiteSpace(parentPath) ? null : parentPath.Trim(),
            Depth = depth,
            ObjectType = objectType.Trim(),
            TriangleCount = triangleCount,
            VertexCount = vertexCount,
            GeometryHash = string.IsNullOrWhiteSpace(geometryHash) ? null : geometryHash.Trim(),
            GeometryHashVersion = geometryHashVersion,
            HasUvs = hasUvs,
            Detail = detail,
            CreatedAt = createdAt
        };
    }
}
