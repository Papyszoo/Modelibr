namespace Application.Extraction;

/// <summary>Asset-family discriminators used by the extraction layer (AssetExtraction / ExtractionJob).</summary>
public static class ExtractionAssetTypes
{
    public const string Model = "Model";
    public const string TextureSet = "TextureSet";
    public const string Sound = "Sound";
    public const string Script = "Script";
    public const string Sprite = "Sprite";
    public const string EnvironmentMap = "EnvironmentMap";
}

/// <summary>
/// Extractor families for job scheduling - each can be given its own concurrency
/// limit so large-geometry work never starves script indexing.
/// </summary>
public static class ExtractorFamilies
{
    public const string Geometry = "Geometry";
    public const string Material = "Material";
    public const string Audio = "Audio";
    public const string Script = "Script";

    /// <summary>On-demand expensive compute (UV overlap, texel density, per-part renders) - its own concurrency lane.</summary>
    public const string Compute = "Compute";
}

/// <summary>
/// Extractor / schema / geometry-hash versions. Bumping one marks the matching
/// rows stale (invalidation = set difference on these numbers + the file hash).
/// </summary>
public static class ExtractionVersions
{
    /// <summary>Version of the model geometry extractor (three.js/bpy technical metadata).</summary>
    public const int ModelGeometryExtractor = 1;

    /// <summary>Version of the order-invariant geometry hash function (owned by prompt 21).</summary>
    public const int GeometryHash = 1;

    /// <summary>Version of the raw payload schema/shape.</summary>
    public const int Schema = 1;
}
