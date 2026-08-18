using System.Text.Json;
using Application.Models;

namespace Application.Search;

/// <summary>
/// How an asset's UVs are laid out - the difference between a model that can be baked
/// to a fresh texture set as it stands and one whose UVs have to be regenerated first.
///
/// <para>
/// The signal is the union of every mesh's UV bounding box across the asset, compared
/// against the 0-1 square. It is deliberately the <b>asset's</b> union rather than each
/// mesh's own box: a character whose body, hair and eyes each occupy a corner of its own
/// atlas is properly unwrapped and bakes fine, and judging its meshes one at a time would
/// call every one of them packed. What actually matters is how much of a texture the whole
/// asset owns.
/// </para>
///
/// <para>
/// Measured on the 1,717-model library, the distribution is sharply bimodal: 384 assets
/// under 5% coverage - which sampling identifies as precisely the POLYGON City fleet - and
/// 530 above 90%. The palette technique those packs use squeezes each model onto a few
/// pixels of one shared swatch texture. Those UVs are real and correct; the model renders
/// right today because of them. They just leave no room to bake anything new, which is what
/// <see cref="AtlasPacked"/> records - it is not a claim that the model is unwrapped.
/// </para>
/// </summary>
public static class UvStatusClassifier
{
    /// <summary>Every mesh has UVs and the asset occupies most of its own 0-1 space: bakeable as it stands.</summary>
    public const string Unwrapped = "unwrapped";

    /// <summary>
    /// Every mesh has UVs, but the asset's whole layout fits in a small corner of the 0-1
    /// square - the signature of a shared palette or atlas texture. The UVs exist and work;
    /// there is simply no texel budget to bake into, so an unwrap (as a second channel)
    /// comes first.
    /// </summary>
    public const string AtlasPacked = "atlas_packed";

    /// <summary>
    /// UVs run outside the 0-1 square, so the asset repeats a tiling texture or a trim
    /// sheet. Like <see cref="AtlasPacked"/> the UVs are correct and deliberate, and like it
    /// they cannot receive a bake: two surfaces sharing a texel cannot hold different baked
    /// values.
    /// </summary>
    public const string Tiled = "tiled";

    /// <summary>Some meshes carry UVs and some do not - the untextured ones need a pass before anything bakes.</summary>
    public const string Partial = "partial";

    /// <summary>No mesh in the asset has UVs at all.</summary>
    public const string NoUvs = "no_uvs";

    /// <summary>
    /// Fraction of the 0-1 square an asset's UV bounding box must cover to count as
    /// unwrapped rather than packed.
    ///
    /// <para>
    /// There is no gap in the data to cut at - coverage is a gradient between the two modes -
    /// so this is a judgement, set from what the categories are <i>for</i>: an asset using
    /// less than half of its texture has more than half of it to gain from an unwrap, which
    /// is worth flagging as a bake candidate. On the real library the cut puts 775 assets in
    /// <see cref="AtlasPacked"/> and 880 in <see cref="Unwrapped"/>, and sampling the band it
    /// moves (10-50%) returns `SM_Prop_ATM_01`, `SM_Bld_Apartment_Stack_01` and their
    /// neighbours - the same palette packs as the extreme mode, just less tightly packed.
    /// </para>
    /// </summary>
    public const double UnwrappedCoverageThreshold = 0.50;

    /// <summary>
    /// How far outside 0-1 a UV must reach before the layout is read as tiling. Loose enough
    /// that a rounding overshoot or a hair of bleed past the edge is not mistaken for a trim
    /// sheet, which a 1.001 tolerance would have done to a good part of the glTF samples.
    /// </summary>
    private const double TilingTolerance = 0.05;

    /// <summary>The UV extent an asset's meshes span together, in UV units.</summary>
    public readonly record struct UvExtent(double MinU, double MinV, double MaxU, double MaxV)
    {
        /// <summary>Fraction of the 0-1 square the bounding box covers. Above 1 for a tiling layout.</summary>
        public double Coverage => Math.Max(0, MaxU - MinU) * Math.Max(0, MaxV - MinV);

        public bool ReachesOutsideUnitSquare =>
            MinU < -TilingTolerance || MinV < -TilingTolerance ||
            MaxU > 1 + TilingTolerance || MaxV > 1 + TilingTolerance;
    }

    /// <summary>
    /// Classifies an asset from its extracted parts. Null when nothing can be said - the
    /// asset has no meshes, or its meshes claim UVs that the extraction never measured.
    /// Unknown must not collapse into <see cref="Unwrapped"/>: a filter for "ready to bake"
    /// that silently includes unmeasured assets is worse than one that leaves them out.
    /// </summary>
    public static string? Classify(IEnumerable<SceneGraphPartDto> parts)
    {
        var meshes = parts.Where(p => string.Equals(p.ObjectType, "mesh", StringComparison.OrdinalIgnoreCase)).ToList();
        if (meshes.Count == 0)
        {
            return null;
        }

        var withUvs = meshes.Count(p => p.HasUvs == true);
        return Classify(meshes.Count, withUvs, UnionOfUvBounds(meshes.Select(p => p.Detail)));
    }

    /// <summary>The rule itself, free of any JSON or DTO shape so it can be exercised directly.</summary>
    public static string? Classify(int meshCount, int meshesWithUvs, UvExtent? union)
    {
        if (meshCount <= 0)
        {
            return null;
        }

        if (meshesWithUvs == 0)
        {
            return NoUvs;
        }

        if (meshesWithUvs < meshCount)
        {
            return Partial;
        }

        // Every mesh claims UVs but none of them was measured - say nothing rather than
        // guess which side of the threshold the asset would have fallen.
        if (union is not { } extent)
        {
            return null;
        }

        // Checked before coverage, because a tiling layout's bounding box is larger than the
        // unit square and would otherwise read as generously unwrapped.
        if (extent.ReachesOutsideUnitSquare)
        {
            return Tiled;
        }

        return extent.Coverage >= UnwrappedCoverageThreshold ? Unwrapped : AtlasPacked;
    }

    /// <summary>
    /// The box enclosing every mesh's UV bounds. Parts without a measured <c>uvBounds</c>
    /// contribute nothing rather than collapsing the union toward the origin.
    /// </summary>
    private static UvExtent? UnionOfUvBounds(IEnumerable<JsonElement?> partDetails)
    {
        double minU = double.PositiveInfinity, minV = double.PositiveInfinity;
        double maxU = double.NegativeInfinity, maxV = double.NegativeInfinity;
        var found = false;

        foreach (var partDetail in partDetails)
        {
            if (partDetail is not { ValueKind: JsonValueKind.Object } detail ||
                !detail.TryGetProperty("uvBounds", out var bounds) ||
                bounds.ValueKind != JsonValueKind.Object ||
                !TryReadPair(bounds, "min", out var pMinU, out var pMinV) ||
                !TryReadPair(bounds, "max", out var pMaxU, out var pMaxV))
            {
                continue;
            }

            found = true;
            minU = Math.Min(minU, pMinU);
            minV = Math.Min(minV, pMinV);
            maxU = Math.Max(maxU, pMaxU);
            maxV = Math.Max(maxV, pMaxV);
        }

        return found ? new UvExtent(minU, minV, maxU, maxV) : null;
    }

    private static bool TryReadPair(JsonElement bounds, string name, out double u, out double v)
    {
        u = 0;
        v = 0;
        if (!bounds.TryGetProperty(name, out var pair) ||
            pair.ValueKind != JsonValueKind.Array ||
            pair.GetArrayLength() < 2)
        {
            return false;
        }

        var values = pair.EnumerateArray().Take(2).ToList();
        if (values[0].ValueKind != JsonValueKind.Number || values[1].ValueKind != JsonValueKind.Number)
        {
            return false;
        }

        u = values[0].GetDouble();
        v = values[1].GetDouble();
        return double.IsFinite(u) && double.IsFinite(v);
    }
}
