using Domain.ValueObjects;

namespace Domain.Models;

/// <summary>
/// Verbatim output of a metadata extraction run for one asset file, kept as the
/// raw source of truth (the derived/interpreted layer is computed separately with
/// its own version). One row per (AssetType, AssetId, VersionId, FileSha256).
///
/// Reproducible: the <see cref="RawPayload"/> is produced by the worker with
/// sorted collections, rounded floats and no timestamps/absolute paths, so the
/// same input bytes yield the same content. Versioned: <see cref="ExtractorVersion"/>
/// (and, for 3D, <see cref="GeometryHashVersion"/>) combined with the file hash
/// answers "which assets need re-extraction?" as a set difference. Re-extraction
/// is idempotent - the same key upserts in place via <see cref="UpdatePayload"/>.
/// </summary>
public class AssetExtraction
{
    public int Id { get; private set; }

    /// <summary>Asset family this row describes: "Model", "TextureSet", "Sound", "Script", "Sprite", "EnvironmentMap".</summary>
    public string AssetType { get; private set; } = string.Empty;

    /// <summary>Id of the asset within its family.</summary>
    public int AssetId { get; private set; }

    /// <summary>Version id where the family is versioned (models); null otherwise.</summary>
    public int? VersionId { get; private set; }

    /// <summary>SHA-256 of the extracted file - the invalidation key alongside the extractor version.</summary>
    public string FileSha256 { get; private set; } = string.Empty;

    /// <summary>Verbatim extractor output as JSON (stored as jsonb). Never trimmed or reinterpreted here.</summary>
    public string RawPayload { get; private set; } = "{}";

    /// <summary>Version of the extractor that produced <see cref="RawPayload"/>. Bumping it marks rows stale.</summary>
    public int ExtractorVersion { get; private set; }

    /// <summary>Version of the order-invariant geometry hash function (3D only); null for non-mesh assets.</summary>
    public int? GeometryHashVersion { get; private set; }

    /// <summary>Version of the payload schema/shape, independent of the extractor logic.</summary>
    public int SchemaVersion { get; private set; }

    /// <summary>Whether the run was complete, partial, or failed.</summary>
    public ExtractionOutcome Outcome { get; private set; } = ExtractionOutcome.Complete;

    /// <summary>
    /// Human-readable warnings from a partial run (skipped fields, unresolved
    /// references, importer complaints) - surfaced in the UI so users see why a
    /// malformed upload indexed incompletely. Empty on a clean run.
    /// </summary>
    public List<string> Warnings { get; private set; } = new();

    public DateTime ExtractedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    public static AssetExtraction Create(
        string assetType,
        int assetId,
        int? versionId,
        string fileSha256,
        string rawPayload,
        int extractorVersion,
        int schemaVersion,
        DateTime extractedAt,
        int? geometryHashVersion = null,
        ExtractionOutcome outcome = ExtractionOutcome.Complete,
        IEnumerable<string>? warnings = null)
    {
        ValidateAssetType(assetType);
        ValidateAssetId(assetId);
        ValidateVersionId(versionId);
        ValidateFileSha256(fileSha256);
        ValidateExtractorVersion(extractorVersion);
        ValidateSchemaVersion(schemaVersion);

        return new AssetExtraction
        {
            AssetType = assetType.Trim(),
            AssetId = assetId,
            VersionId = versionId,
            FileSha256 = fileSha256.Trim(),
            RawPayload = string.IsNullOrWhiteSpace(rawPayload) ? "{}" : rawPayload,
            ExtractorVersion = extractorVersion,
            GeometryHashVersion = geometryHashVersion,
            SchemaVersion = schemaVersion,
            Outcome = outcome,
            Warnings = NormalizeWarnings(warnings),
            ExtractedAt = extractedAt,
            UpdatedAt = extractedAt
        };
    }

    /// <summary>
    /// Idempotent re-extraction: replaces the payload and versions in place for
    /// the same (AssetType, AssetId, VersionId, FileSha256) key.
    /// </summary>
    public void UpdatePayload(
        string rawPayload,
        int extractorVersion,
        int schemaVersion,
        DateTime extractedAt,
        int? geometryHashVersion = null,
        ExtractionOutcome outcome = ExtractionOutcome.Complete,
        IEnumerable<string>? warnings = null)
    {
        ValidateExtractorVersion(extractorVersion);
        ValidateSchemaVersion(schemaVersion);

        RawPayload = string.IsNullOrWhiteSpace(rawPayload) ? "{}" : rawPayload;
        ExtractorVersion = extractorVersion;
        GeometryHashVersion = geometryHashVersion;
        SchemaVersion = schemaVersion;
        Outcome = outcome;
        Warnings = NormalizeWarnings(warnings);
        ExtractedAt = extractedAt;
        UpdatedAt = extractedAt;
    }

    private static List<string> NormalizeWarnings(IEnumerable<string>? warnings) =>
        (warnings ?? Enumerable.Empty<string>())
            .Where(w => !string.IsNullOrWhiteSpace(w))
            .Select(w => w.Trim())
            .ToList();

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

    private static void ValidateFileSha256(string fileSha256)
    {
        if (string.IsNullOrWhiteSpace(fileSha256))
            throw new ArgumentException("File SHA-256 cannot be null or whitespace.", nameof(fileSha256));
        if (fileSha256.Trim().Length != 64)
            throw new ArgumentException("File SHA-256 must be 64 characters.", nameof(fileSha256));
    }

    private static void ValidateExtractorVersion(int extractorVersion)
    {
        if (extractorVersion < 1)
            throw new ArgumentException("Extractor version must be at least 1.", nameof(extractorVersion));
    }

    private static void ValidateSchemaVersion(int schemaVersion)
    {
        if (schemaVersion < 1)
            throw new ArgumentException("Schema version must be at least 1.", nameof(schemaVersion));
    }
}
