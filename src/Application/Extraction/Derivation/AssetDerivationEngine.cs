using System.Globalization;

namespace Application.Extraction.Derivation;

/// <summary>
/// Computes the derived-signal layer from raw extraction facts — a pure function
/// of (parts + rollups + options), re-runnable in minutes without re-extracting.
/// It never mutates raw data and never overwrites authored names; inferred guesses
/// (geometric priors) live in a separate field and stay off until calibrated
/// (prompt 26). All thresholds come from <see cref="DerivationOptions"/>.
/// </summary>
public static class AssetDerivationEngine
{
    private static readonly string[] CollisionMarkers = { "collision", "collider", "ucx", "col", "hitbox", "proxy" };

    public static DerivedAsset Derive(DerivationAssetInput asset, DerivationOptions options)
    {
        options ??= new DerivationOptions();
        var parts = asset.Parts ?? Array.Empty<DerivationPartInput>();

        // 1. Tokens + meaningfulness per part.
        var tokensByPath = parts.ToDictionary(
            p => p.PartPath,
            p => NameTokenizer.Tokenize(p.Name, options));
        bool Meaningful(DerivationPartInput p) => NameTokenizer.HasMeaningfulTokens(tokensByPath[p.PartPath]);

        // 2. Instance groups by geometry hash; first member (depth, then path) is the representative.
        var representatives = new HashSet<string>(StringComparer.Ordinal);
        var groupSizeByHash = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var group in parts
                     .Where(p => !string.IsNullOrEmpty(p.GeometryHash))
                     .GroupBy(p => p.GeometryHash!, StringComparer.Ordinal))
        {
            groupSizeByHash[group.Key] = group.Count();
            var rep = group.OrderBy(p => p.Depth).ThenBy(p => p.PartPath, StringComparer.Ordinal).First();
            representatives.Add(rep.PartPath);
        }
        bool IsRepresentative(DerivationPartInput p) =>
            string.IsNullOrEmpty(p.GeometryHash) || representatives.Contains(p.PartPath);

        // 3. Unnamed-asset degenerate case (Object.001…Object.247).
        var namedCount = parts.Count(Meaningful);
        var unnamed = parts.Count > 0 &&
                      (double)(parts.Count - namedCount) / parts.Count >= options.UnnamedPartFraction;

        // 4. Base prominence pass.
        var prominence = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var p in parts)
        {
            if (IsHelper(p.ObjectType) || p.Hidden || IsCollision(p, tokensByPath[p.PartPath]) || LodIndex(p.Name) > 0)
            {
                prominence[p.PartPath] = Prominence.Hidden;
            }
            else if (!IsRepresentative(p))
            {
                prominence[p.PartPath] = Prominence.Secondary; // duplicate instance member
            }
            else if (Meaningful(p))
            {
                prominence[p.PartPath] = Prominence.Full; // naming rule outranks size
            }
            else
            {
                prominence[p.PartPath] = Prominence.Secondary;
            }
        }

        // 5. Degenerate fallback: with no meaningful names anywhere, rank the unnamed
        //    representatives by size + depth so the asset still surfaces something.
        if (unnamed)
        {
            var eligible = parts
                .Where(p => prominence[p.PartPath] == Prominence.Secondary && IsRepresentative(p) && !Meaningful(p))
                .OrderByDescending(p => MaxDimension(p.Dimensions) ?? 0)
                .ThenBy(p => p.Depth)
                .ThenBy(p => p.PartPath, StringComparer.Ordinal)
                .ToList();
            var promote = Math.Max(1, (int)Math.Ceiling(eligible.Count * 0.25));
            foreach (var p in eligible.Take(promote))
            {
                prominence[p.PartPath] = Prominence.Full;
            }
        }

        // 6. Per-part derived rows.
        var derivedParts = parts.Select(p => new DerivedPart(
            PartPath: p.PartPath,
            Tokens: tokensByPath[p.PartPath],
            Prominence: prominence[p.PartPath],
            ShapeClass: ClassifyShape(p.Dimensions, options),
            InstanceGroup: !string.IsNullOrEmpty(p.GeometryHash) && groupSizeByHash.GetValueOrDefault(p.GeometryHash!) > 1
                ? p.GeometryHash
                : null,
            InstanceRepresentative: IsRepresentative(p),
            QualityFlags: PartQualityFlags(p),
            BrowseSummary: PartBrowseSummary(p, tokensByPath[p.PartPath]),
            Prior: options.EnableGeometricPriors ? InferPrior(p, asset.WorldDimensions, options) : null))
            .ToList();

        // 7. Asset-level signals.
        var gridSize = DetectGridSize(asset, parts, options);
        var modularKit = DetectModularKit(parts, gridSize, options);
        var lodChains = DetectLodChains(parts);
        var assetTokens = NameTokenizer.Tokenize(asset.AssetName, options);

        return new DerivedAsset(
            DeriveVersion: options.DeriveVersion,
            Tokens: assetTokens,
            OriginConvention: ClassifyOrigin(asset.OriginInBounds, options),
            GridSize: gridSize,
            ModularKit: modularKit,
            ShapeClass: ClassifyShape(asset.WorldDimensions, options),
            LodChains: lodChains,
            QualityFlags: AssetQualityFlags(parts),
            BrowseSummary: AssetBrowseSummary(asset, parts, gridSize, modularKit, unnamed),
            Unnamed: unnamed,
            Parts: derivedParts);
    }

    // ---- helpers ---------------------------------------------------------

    private static bool IsHelper(string objectType) =>
        objectType is "empty" or "group" or "null" or "helper" or "light" or "camera" or "";

    private static bool IsCollision(DerivationPartInput p, IReadOnlyList<string> tokens)
    {
        var name = (p.Name ?? string.Empty).ToLowerInvariant();
        return CollisionMarkers.Any(m => tokens.Contains(m) || name.Contains(m));
    }

    /// <summary>LOD index from a name like "Wall_LOD2" → 2; 0 when none / LOD0.</summary>
    private static int LodIndex(string? name)
    {
        if (string.IsNullOrEmpty(name)) return 0;
        var m = System.Text.RegularExpressions.Regex.Match(name, @"lod[_\s]?(\d+)",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        return m.Success && int.TryParse(m.Groups[1].Value, out var i) ? i : 0;
    }

    private static double? MaxDimension(IReadOnlyList<double>? dims) =>
        dims is { Count: > 0 } ? dims.Max() : null;

    private static string? ClassifyShape(IReadOnlyList<double>? dims, DerivationOptions options)
    {
        if (dims is not { Count: 3 }) return null;
        var sorted = dims.OrderByDescending(d => d).ToList();
        var (max, mid, min) = (sorted[0], sorted[1], sorted[2]);
        if (max <= 0) return null;

        if (min / max <= options.ShapePlanarRatio) return "planar";
        if (max / Math.Max(mid, 1e-9) >= options.ShapeElongationRatio)
        {
            // Tall when the vertical (Y, index 1) axis is the dominant one.
            var maxAxis = 0;
            for (var i = 1; i < dims.Count; i++)
            {
                if (dims[i] > dims[maxAxis]) maxAxis = i;
            }
            return maxAxis == 1 ? "tall" : "wide";
        }
        return "blocky";
    }

    private static string? ClassifyOrigin(IReadOnlyList<double>? originInBounds, DerivationOptions options)
    {
        if (originInBounds is not { Count: 3 }) return null;
        var tol = options.OriginEdgeTolerance;
        bool Near(double v, double target) => Math.Abs(v - target) <= tol;

        var (x, y, z) = (originInBounds[0], originInBounds[1], originInBounds[2]);
        if (Near(x, 0.5) && Near(y, 0.5) && Near(z, 0.5)) return "centered";
        if (Near(x, 0.5) && Near(z, 0.5) && Near(y, 0.0)) return "bottom-center";
        if (Near(x, 0.0) && Near(y, 0.0) && Near(z, 0.0)) return "corner";
        return null;
    }

    private static double? SnapGrid(double dim, DerivationOptions options)
    {
        if (dim <= 0) return null;
        foreach (var grid in options.GridSizes.OrderByDescending(g => g))
        {
            var multiple = Math.Round(dim / grid);
            if (multiple >= 1 && Math.Abs(dim - multiple * grid) <= grid * options.GridTolerance)
            {
                return grid;
            }
        }
        return null;
    }

    private static double? DetectGridSize(DerivationAssetInput asset, IReadOnlyList<DerivationPartInput> parts, DerivationOptions options)
    {
        // The grid a majority of sized parts (and the world bounds) snap to.
        var votes = new Dictionary<double, int>();
        void Vote(IReadOnlyList<double>? dims)
        {
            if (dims is not { Count: > 0 }) return;
            foreach (var d in dims)
            {
                var g = SnapGrid(d, options);
                if (g is not null) votes[g.Value] = votes.GetValueOrDefault(g.Value) + 1;
            }
        }
        foreach (var p in parts) Vote(p.Dimensions);
        Vote(asset.WorldDimensions);

        return votes.Count == 0 ? null : votes.OrderByDescending(kv => kv.Value).ThenByDescending(kv => kv.Key).First().Key;
    }

    private static bool DetectModularKit(IReadOnlyList<DerivationPartInput> parts, double? gridSize, DerivationOptions options)
    {
        if (gridSize is null) return false;
        var sized = parts.Where(p => p.Dimensions is { Count: > 0 }).ToList();
        if (sized.Count < 3) return false;
        var snapping = sized.Count(p => p.Dimensions!.Any(d => SnapGrid(d, options) == gridSize));
        return snapping >= Math.Ceiling(sized.Count / 2.0);
    }

    private static IReadOnlyList<DerivedLodChain> DetectLodChains(IReadOnlyList<DerivationPartInput> parts)
    {
        var chains = new List<DerivedLodChain>();
        var byBase = parts
            .Select(p => (part: p, lod: LodIndex(p.Name)))
            .Where(x => System.Text.RegularExpressions.Regex.IsMatch(x.part.Name ?? "", @"lod",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            .GroupBy(x => System.Text.RegularExpressions.Regex.Replace(x.part.Name ?? "", @"[_\s]?lod[_\s]?\d+", "",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase).Trim());

        foreach (var group in byBase)
        {
            var ordered = group.OrderBy(x => x.lod).Select(x => x.part.PartPath).ToList();
            if (ordered.Count >= 2)
            {
                chains.Add(new DerivedLodChain(group.Key, ordered));
            }
        }
        return chains;
    }

    private static IReadOnlyList<string> PartQualityFlags(DerivationPartInput p)
    {
        var flags = new List<string>();
        if (p.ObjectType == "mesh" && p.HasUvs == false) flags.Add("no_uvs");
        if (p.NegativeScale) flags.Add("negative_scale");
        if (p.UnappliedScale) flags.Add("unapplied_scale");
        if (p.Dimensions is { Count: 3 } && p.Dimensions.All(d => d <= 0)) flags.Add("degenerate_bounds");
        return flags;
    }

    private static IReadOnlyList<string> AssetQualityFlags(IReadOnlyList<DerivationPartInput> parts)
    {
        var flags = new List<string>();
        var meshes = parts.Where(p => p.ObjectType == "mesh").ToList();
        if (meshes.Count == 0) flags.Add("no_geometry");
        if (meshes.Any(p => p.HasUvs == false)) flags.Add("missing_uvs");
        if (parts.Any(p => p.NegativeScale)) flags.Add("negative_scale");
        if (parts.Any(p => p.UnappliedScale)) flags.Add("unapplied_scale");
        return flags;
    }

    private static GeometricPrior? InferPrior(DerivationPartInput p, IReadOnlyList<double>? worldDims, DerivationOptions options)
    {
        // Only a couple of high-confidence shapes; deliberately conservative and OFF
        // by default until calibrated (prompt 26). Kept separate from authored data.
        if (p.Dimensions is not { Count: 3 }) return null;
        var (x, y, z) = (p.Dimensions[0], p.Dimensions[1], p.Dimensions[2]);
        var thin = Math.Min(Math.Min(x, y), z);
        var tall = y;
        // Door: ~2m tall, <1.2m wide, thin.
        if (tall is >= 1.8 and <= 2.4 && Math.Max(x, z) <= 1.2 && thin <= 0.2)
        {
            return new GeometricPrior("door", 0.5);
        }
        return null;
    }

    private static string DisplayName(DerivationPartInput p, IReadOnlyList<string> tokens) =>
        !string.IsNullOrWhiteSpace(p.Name) && NameTokenizer.HasMeaningfulTokens(tokens)
            ? p.Name.Trim()
            : p.ObjectType;

    private static string FormatDims(IReadOnlyList<double>? dims)
    {
        if (dims is not { Count: 3 }) return "";
        return string.Format(CultureInfo.InvariantCulture, "{0:0.##}×{1:0.##}×{2:0.##} m",
            dims[0], dims[1], dims[2]);
    }

    private static string PartBrowseSummary(DerivationPartInput p, IReadOnlyList<string> tokens)
    {
        var name = DisplayName(p, tokens);
        var parts = new List<string>();
        // Don't repeat the object type when the display name already fell back to it
        // (generic/unnamed parts) — avoids "mesh — mesh, 384 tris".
        if (!string.Equals(name, p.ObjectType, StringComparison.OrdinalIgnoreCase))
        {
            parts.Add(p.ObjectType);
        }
        if (p.TriangleCount is > 0)
        {
            parts.Add(string.Format(CultureInfo.InvariantCulture, "{0:N0} tris", p.TriangleCount.Value));
        }
        var dims = FormatDims(p.Dimensions);
        if (dims.Length > 0) parts.Add(dims);
        return $"{name} — {string.Join(", ", parts)}";
    }

    private static string AssetBrowseSummary(
        DerivationAssetInput asset,
        IReadOnlyList<DerivationPartInput> parts,
        double? gridSize,
        bool modularKit,
        bool unnamed)
    {
        var name = string.IsNullOrWhiteSpace(asset.AssetName) ? "Asset" : asset.AssetName.Trim();
        var segments = new List<string>
        {
            $"{parts.Count} part{(parts.Count == 1 ? "" : "s")}",
        };
        var totalTris = parts.Sum(p => (long)(p.TriangleCount ?? 0));
        if (totalTris > 0)
        {
            segments.Add(string.Format(CultureInfo.InvariantCulture, "{0:N0} tris", totalTris));
        }
        var dims = FormatDims(asset.WorldDimensions);
        if (dims.Length > 0) segments.Add(dims);
        var summary = $"{name} — {string.Join(", ", segments)}";
        if (modularKit && gridSize is not null)
        {
            summary += string.Format(CultureInfo.InvariantCulture, "; modular kit ({0:0.##} m grid)", gridSize.Value);
        }
        if (unnamed) summary += "; unnamed";
        return summary;
    }
}
