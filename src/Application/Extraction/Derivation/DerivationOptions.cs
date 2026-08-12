namespace Application.Extraction.Derivation;

/// <summary>
/// Tunable thresholds for the derived-signal layer. Every value here is a
/// <b>config-driven guess</b> until the fixture set (prompt 26) calibrates it -
/// wired to config, never hardcoded at a call site, so calibration is a settings
/// change rather than a code change. Bound once in DI from the "Derivation"
/// configuration section (falls back to these defaults).
/// </summary>
public sealed class DerivationOptions
{
    /// <summary>Version of the derive logic. Bump when a rule changes so stored derivations can be re-run as a set difference.</summary>
    public int DeriveVersion { get; set; } = 1;

    /// <summary>Prefixes stripped from names before tokenising (case-insensitive), e.g. "SM_" for static meshes.</summary>
    public string[] StripPrefixes { get; set; } =
        { "SM_", "SK_", "M_", "MI_", "T_", "mesh_", "obj_" };

    /// <summary>A part whose largest bounding-box dimension is below this (metres) drops to secondary prominence unless its name carries tokens.</summary>
    public double SmallPartSizeFloor { get; set; } = 0.05;

    /// <summary>Candidate grid sizes (metres) a dimension is tested against for snapping.</summary>
    public double[] GridSizes { get; set; } = { 0.25, 0.5, 1.0, 2.0, 4.0 };

    /// <summary>Fractional tolerance for calling a dimension "on grid" (0.02 = within 2%).</summary>
    public double GridTolerance { get; set; } = 0.02;

    /// <summary>A part origin within this fraction of a bound edge is treated as sitting on that edge (for origin convention).</summary>
    public double OriginEdgeTolerance { get; set; } = 0.05;

    /// <summary>Bounding-box axis-ratio above which a shape is "tall"/"wide" rather than "blocky".</summary>
    public double ShapeElongationRatio { get; set; } = 3.0;

    /// <summary>Ratio of the smallest to largest dimension below which a shape is "planar" (flat/thin).</summary>
    public double ShapePlanarRatio { get; set; } = 0.1;

    /// <summary>An asset is flagged "unnamed" when at least this fraction of its parts yield no meaningful tokens.</summary>
    public double UnnamedPartFraction { get; set; } = 0.6;

    /// <summary>Geometric priors (inferring door/window/etc. from dimensions) stay OFF until validated against the fixture set (prompt 26).</summary>
    public bool EnableGeometricPriors { get; set; } = false;
}
