namespace Domain.Projects;

/// <summary>
/// The bridge from a project's style label to something search can act on (prompt 13-D2).
///
/// <para>
/// <c>Low Poly</c> is a word. Search cannot rank on a word that appears in no asset's name.
/// This maps each <b>built-in</b> style onto concrete signals: caps a query can carry, tokens
/// that should rank an asset up, tokens that should rank it down, and which asset family the
/// style implies.
/// </para>
///
/// <para>
/// <b>In code, not the database</b>, deliberately: it is a mapping between two vocabularies,
/// it will be wrong at first, and it needs to be reviewed, tested and corrected the way code
/// is. The vocabulary itself is user-extendable data; this reading of it is not.
/// </para>
///
/// <para>
/// <b>An unmapped style degrades to "no constraint", never to "no results".</b> A style the
/// user invented contributes its own name as a boost token and nothing else. Getting that
/// backwards would make every custom style return an empty library.
/// </para>
/// </summary>
public static class ProjectStyleSignals
{
    /// <param name="MaxTriangles">A cap this style implies, or null for none. A hint, never a filter on its own.</param>
    /// <param name="MaxTextureSize">As above, for texture resolution.</param>
    /// <param name="MaxMaterials">As above, for material count.</param>
    /// <param name="PreferredUvStatus">A UV layout typical of the style, or null.</param>
    /// <param name="BoostTokens">Words whose presence marks an asset as belonging to the style.</param>
    /// <param name="PenaltyTokens">
    /// Words that mark an asset as belonging to a different one. <b>Penalties demote; they
    /// never exclude.</b> They exist because positive boosts alone cannot stop a 180k-triangle
    /// photoscan winning "chair" in a low-poly project - a generic query matches the wrong
    /// asset just as completely as the right one.
    /// </param>
    /// <param name="FamilyHint">The asset family the style implies, or null when it implies none.</param>
    public sealed record StyleSignals(
        int? MaxTriangles,
        int? MaxTextureSize,
        int? MaxMaterials,
        string? PreferredUvStatus,
        IReadOnlyList<string> BoostTokens,
        IReadOnlyList<string> PenaltyTokens,
        string? FamilyHint);

    public const string FamilyModel = "Model";
    public const string FamilySprite = "Sprite";

    // NOTE on the penalty column, because the tempting version is wrong: `pbr` is NOT a
    // penalty term for Low Poly. glTF is PBR by construction and the POLYGON City fleet is
    // PBR-materialled low poly, so penalising it would demote most of the library. What
    // actually marks a high-fidelity source asset is `photoscan`, `scan`, `4k`, `8k`,
    // `hi-poly`. `pbr` survives only on Retro / PS1, where the style genuinely predates PBR
    // shading and the word means "wrong era".
    private static readonly IReadOnlyDictionary<string, StyleSignals> Signals =
        new Dictionary<string, StyleSignals>(StringComparer.Ordinal)
        {
            ["low poly"] = new(
                MaxTriangles: 5000,
                MaxTextureSize: null,
                MaxMaterials: 4,
                // Not a guess: atlas_packed lands on exactly the palette-atlas assets a
                // low-poly pack is built from.
                PreferredUvStatus: "atlas_packed",
                BoostTokens: new[] { "low poly", "lowpoly", "faceted", "flat shaded" },
                PenaltyTokens: new[] { "photoscan", "scan", "4k", "8k", "hi-poly" },
                FamilyHint: FamilyModel),

            ["realistic"] = new(
                null, null, null, null,
                BoostTokens: new[] { "realistic", "scan", "photoscan", "hi-poly" },
                PenaltyTokens: new[] { "cartoon", "toon", "lowpoly", "voxel" },
                FamilyHint: FamilyModel),

            ["stylized"] = new(
                null, null, null, null,
                BoostTokens: new[] { "stylized", "stylised", "hand painted" },
                PenaltyTokens: new[] { "photoscan", "scan" },
                FamilyHint: FamilyModel),

            ["cartoon"] = new(
                MaxTriangles: null,
                MaxTextureSize: null,
                MaxMaterials: 6,
                PreferredUvStatus: null,
                BoostTokens: new[] { "cartoon", "stylized", "toon" },
                PenaltyTokens: new[] { "photoscan", "scan", "realistic" },
                FamilyHint: FamilyModel),

            ["cel shaded"] = new(
                null, null, null, null,
                BoostTokens: new[] { "cel", "toon", "outline", "ink" },
                PenaltyTokens: new[] { "photoscan", "scan" },
                FamilyHint: FamilyModel),

            ["voxel"] = new(
                MaxTriangles: null,
                MaxTextureSize: null,
                MaxMaterials: null,
                PreferredUvStatus: null,
                BoostTokens: new[] { "voxel", "blocky", "cube" },
                PenaltyTokens: new[] { "photoscan", "scan", "smooth", "sculpt" },
                FamilyHint: FamilyModel),

            ["pixel art"] = new(
                null, null, null, null,
                BoostTokens: new[] { "pixel", "8-bit", "16-bit" },
                PenaltyTokens: Array.Empty<string>(),
                // The one style whose family hint is not Model. A pixel-art project asking
                // for a "chair" wants a sprite, and nothing else in the profile says so.
                FamilyHint: FamilySprite),

            ["retro / ps1"] = new(
                MaxTriangles: 2000,
                MaxTextureSize: 256,
                MaxMaterials: null,
                PreferredUvStatus: null,
                BoostTokens: new[] { "ps1", "retro", "lo-fi", "psx" },
                PenaltyTokens: new[] { "photoscan", "scan", "4k", "8k", "pbr", "hi-poly" },
                FamilyHint: FamilyModel),
        };

    /// <summary>
    /// The signals for one style name, or a name-only fallback when the style is one the
    /// user added. Never null, and never empty of boost tokens - a style always contributes
    /// at least its own name.
    /// </summary>
    public static StyleSignals For(string styleName)
    {
        if (string.IsNullOrWhiteSpace(styleName))
        {
            return new StyleSignals(null, null, null, null, Array.Empty<string>(), Array.Empty<string>(), null);
        }

        var key = styleName.Trim().ToLowerInvariant();
        if (Signals.TryGetValue(key, out var signals))
        {
            return signals;
        }

        return new StyleSignals(
            MaxTriangles: null,
            MaxTextureSize: null,
            MaxMaterials: null,
            PreferredUvStatus: null,
            BoostTokens: new[] { styleName.Trim() },
            PenaltyTokens: Array.Empty<string>(),
            FamilyHint: null);
    }

    /// <summary>True when this style name has a hand-written mapping rather than the fallback.</summary>
    public static bool IsMapped(string styleName)
        => !string.IsNullOrWhiteSpace(styleName)
           && Signals.ContainsKey(styleName.Trim().ToLowerInvariant());

    /// <summary>
    /// Merges the signals of several styles into one. Caps take the <b>lowest</b> value any
    /// selected style implies, for the same reason a multi-platform budget does: an asset
    /// that has to satisfy two styles has to fit the stricter one.
    /// </summary>
    /// <remarks>
    /// A token that one style boosts and another penalises is dropped from both lists. Two
    /// styles disagreeing about a word is not evidence either way, and keeping it in both
    /// would let the ranking depend on which list happened to be applied last.
    /// </remarks>
    public static StyleSignals Merge(IEnumerable<string> styleNames)
    {
        var all = styleNames
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Select(For)
            .ToList();

        if (all.Count == 0)
        {
            return new StyleSignals(null, null, null, null, Array.Empty<string>(), Array.Empty<string>(), null);
        }

        var boosts = all.SelectMany(s => s.BoostTokens).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var penalties = all.SelectMany(s => s.PenaltyTokens).Distinct(StringComparer.OrdinalIgnoreCase).ToList();

        var contested = boosts.Intersect(penalties, StringComparer.OrdinalIgnoreCase).ToList();
        boosts = boosts.Except(contested, StringComparer.OrdinalIgnoreCase).ToList();
        penalties = penalties.Except(contested, StringComparer.OrdinalIgnoreCase).ToList();

        var familyHints = all.Select(s => s.FamilyHint).Where(f => f is not null).Distinct().ToList();

        return new StyleSignals(
            MaxTriangles: Min(all.Select(s => s.MaxTriangles)),
            MaxTextureSize: Min(all.Select(s => s.MaxTextureSize)),
            MaxMaterials: Min(all.Select(s => s.MaxMaterials)),
            PreferredUvStatus: all.Select(s => s.PreferredUvStatus).FirstOrDefault(u => u is not null),
            BoostTokens: boosts,
            PenaltyTokens: penalties,
            // Two styles that want different families answer "no hint" rather than picking
            // one: a project that is both Pixel Art and Realistic is telling us its scenes
            // differ, not that one of the two loses.
            FamilyHint: familyHints.Count == 1 ? familyHints[0] : null);
    }

    private static int? Min(IEnumerable<int?> values)
    {
        int? result = null;
        foreach (var value in values)
        {
            if (value is null) continue;
            result = result is null ? value : Math.Min(result.Value, value.Value);
        }

        return result;
    }
}
