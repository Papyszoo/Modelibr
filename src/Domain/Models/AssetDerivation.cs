namespace Domain.Models;

/// <summary>
/// The derived-signal layer for one asset+version: tokens, prominence, origin/grid/
/// kit, instance groups, quality flags and browse summaries, computed from the raw
/// extraction (<see cref="AssetExtraction"/> + <see cref="AssetPart"/>) with its own
/// <see cref="DeriveVersion"/>. Re-derivable in minutes without re-extracting; the
/// raw layer stays the source of truth and is never mutated here.
///
/// The whole derived result is stored verbatim as <see cref="Payload"/> (jsonb).
/// Bumping <see cref="DeriveVersion"/> marks rows stale as a set difference, exactly
/// like the extractor-version invalidation on the raw layer.
/// </summary>
public class AssetDerivation
{
    public int Id { get; private set; }

    public string AssetType { get; private set; } = string.Empty;
    public int AssetId { get; private set; }
    public int? VersionId { get; private set; }

    /// <summary>Version of the derive logic that produced <see cref="Payload"/>.</summary>
    public int DeriveVersion { get; private set; }

    /// <summary>Full derived result as JSON (jsonb): asset-level signals + per-part rows.</summary>
    public string Payload { get; private set; } = "{}";

    public DateTime DerivedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    public static AssetDerivation Create(
        string assetType,
        int assetId,
        int? versionId,
        int deriveVersion,
        string payload,
        DateTime derivedAt)
    {
        ValidateAssetType(assetType);
        ValidateAssetId(assetId);
        ValidateVersionId(versionId);
        ValidateDeriveVersion(deriveVersion);

        return new AssetDerivation
        {
            AssetType = assetType.Trim(),
            AssetId = assetId,
            VersionId = versionId,
            DeriveVersion = deriveVersion,
            Payload = string.IsNullOrWhiteSpace(payload) ? "{}" : payload,
            DerivedAt = derivedAt,
            UpdatedAt = derivedAt
        };
    }

    /// <summary>Idempotent re-derive: replaces the payload and version in place for the same key.</summary>
    public void UpdatePayload(int deriveVersion, string payload, DateTime derivedAt)
    {
        ValidateDeriveVersion(deriveVersion);
        DeriveVersion = deriveVersion;
        Payload = string.IsNullOrWhiteSpace(payload) ? "{}" : payload;
        UpdatedAt = derivedAt;
    }

    private static void ValidateAssetType(string assetType)
    {
        if (string.IsNullOrWhiteSpace(assetType))
            throw new ArgumentException("Asset type cannot be null or whitespace.", nameof(assetType));
    }

    private static void ValidateAssetId(int assetId)
    {
        if (assetId <= 0)
            throw new ArgumentException("Asset id must be greater than 0.", nameof(assetId));
    }

    private static void ValidateVersionId(int? versionId)
    {
        if (versionId.HasValue && versionId.Value <= 0)
            throw new ArgumentException("Version id must be greater than 0 when provided.", nameof(versionId));
    }

    private static void ValidateDeriveVersion(int deriveVersion)
    {
        if (deriveVersion < 1)
            throw new ArgumentException("Derive version must be at least 1.", nameof(deriveVersion));
    }
}
