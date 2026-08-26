namespace Application.Extraction.Derivation;

/// <summary>Prominence - whether and how a part participates in search.</summary>
public static class Prominence
{
    public const string Full = "full";
    /// <summary>Reachable only when explicitly targeted (small/unnamed/duplicate instances).</summary>
    public const string Secondary = "secondary";
    /// <summary>Never surfaced (collision proxies, non-zero LODs, hidden/helper objects).</summary>
    public const string Hidden = "hidden";
}

/// <summary>Raw per-part facts the derive step reads (decoupled from the EF entity so rules are pure-testable).</summary>
public sealed record DerivationPartInput(
    string PartPath,
    string Name,
    string? ParentPath,
    int Depth,
    string ObjectType,
    int? TriangleCount = null,
    string? GeometryHash = null,
    bool? HasUvs = null,
    IReadOnlyList<double>? Dimensions = null,
    bool Hidden = false,
    bool NegativeScale = false,
    bool UnappliedScale = false);

/// <summary>Raw asset-level facts the derive step reads.</summary>
public sealed record DerivationAssetInput(
    string? AssetName,
    IReadOnlyList<double>? WorldDimensions,
    IReadOnlyList<DerivationPartInput> Parts,
    /// <summary>Root origin expressed 0..1 within world bounds per axis (x,y,z), if known.</summary>
    IReadOnlyList<double>? OriginInBounds = null);

/// <summary>Inferred-from-geometry hint kept SEPARATE from authored data (behind a flag, never overwrites names).</summary>
public sealed record GeometricPrior(string Guess, double Confidence);

public sealed record DerivedPart(
    string PartPath,
    IReadOnlyList<string> Tokens,
    string Prominence,
    string? ShapeClass,
    string? InstanceGroup,
    bool InstanceRepresentative,
    IReadOnlyList<string> QualityFlags,
    string BrowseSummary,
    GeometricPrior? Prior = null);

public sealed record DerivedLodChain(string BaseName, IReadOnlyList<string> PartPaths);

public sealed record DerivedAsset(
    int DeriveVersion,
    IReadOnlyList<string> Tokens,
    string? OriginConvention,
    /// <summary>
    /// The measurement <see cref="OriginConvention"/> labels: the root origin as a 0..1
    /// fraction of world bounds per axis. Carried alongside the label because placement
    /// needs the number - an origin at the base but off-centre in X matches no convention,
    /// and a null label was being read downstream as "centred".
    /// </summary>
    IReadOnlyList<double>? OriginInBounds,
    double? GridSize,
    bool ModularKit,
    string? ShapeClass,
    IReadOnlyList<DerivedLodChain> LodChains,
    IReadOnlyList<string> QualityFlags,
    string BrowseSummary,
    bool Unnamed,
    IReadOnlyList<DerivedPart> Parts);
