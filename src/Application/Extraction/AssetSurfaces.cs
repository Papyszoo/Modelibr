namespace Application.Extraction;

/// <summary>
/// A horizontal face on an asset that something else could be put on: a table top, a shelf,
/// a seat.
///
/// The gap this fills was invisible and expensive. <c>place_asset(on: "sofa")</c> rests the
/// new node on the target's <b>whole-asset</b> bounding-box top, which is right by luck for
/// a table and wrong for anything with structure - it puts a cushion on the sofa's back, a
/// book above the shelf rather than on it, and a tap in mid-air over a sink. The parts were
/// already measured; nothing turned them into the one number placement actually consumes.
/// </summary>
/// <param name="Height">
/// Metres above the asset's own base. Stated relative to the base rather than in the asset's
/// raw coordinates because that is what survives the asset being placed anywhere in a scene.
/// </param>
/// <param name="Area">Footprint in square metres - what makes one surface the dominant one.</param>
/// <param name="Extent">The surface's width and depth in metres, as [x, z].</param>
/// <param name="Center">Where its middle sits relative to the asset's base and centre, as [x, y, z].</param>
/// <param name="Parts">The part paths whose tops sit at this height. Several is normal - two arms of one shelf.</param>
public sealed record AssetSurface(
    double Height,
    double Area,
    IReadOnlyList<double> Extent,
    IReadOnlyList<double> Center,
    IReadOnlyList<string> Parts);

/// <summary>
/// Turns measured part boxes into the resting surfaces a caller can act on.
///
/// Deliberately derived here rather than stored: it is a reading of the part boxes, and a
/// reading that was persisted would go stale the moment the derive step improved.
/// </summary>
public static class AssetSurfaces
{
    /// <summary>
    /// Part tops within this distance of each other are one surface. A shelf's two brackets
    /// and its board do not agree to the millimetre, and reporting them as three surfaces
    /// 2 mm apart is the same as reporting none.
    /// </summary>
    private const double HeightToleranceMetres = 0.02;

    /// <summary>
    /// Smallest footprint worth calling a surface. Below this it is a fixing or a trim
    /// piece, and offering it as somewhere to put a lamp is noise.
    /// </summary>
    private const double MinimumAreaSquareMetres = 0.01;

    /// <summary>
    /// How many to report. A dense asset has a top face on every screw; the useful answer is
    /// the handful a person would point at.
    /// </summary>
    private const int MaxSurfaces = 8;

    /// <summary>
    /// The candidate resting surfaces of one asset, largest first.
    ///
    /// The asset's own base is taken from the parts themselves rather than from the derived
    /// whole-asset bounds, so this answers correctly for an asset whose bounds were never
    /// derived - which is most of a library that has not been re-extracted.
    /// </summary>
    public static IReadOnlyList<AssetSurface> From(IEnumerable<(string PartPath, AssetPartBounds? Bounds)> parts)
    {
        var boxes = parts
            .Where(p => p.Bounds is not null)
            .Select(p => (p.PartPath, Bounds: p.Bounds!))
            .Where(p => p.Bounds.Min.Count == 3 && p.Bounds.Max.Count == 3)
            .ToList();

        if (boxes.Count == 0)
        {
            return Array.Empty<AssetSurface>();
        }

        var baseY = boxes.Min(b => b.Bounds.Min[1]);
        var centerX = (boxes.Min(b => b.Bounds.Min[0]) + boxes.Max(b => b.Bounds.Max[0])) / 2;
        var centerZ = (boxes.Min(b => b.Bounds.Min[2]) + boxes.Max(b => b.Bounds.Max[2])) / 2;

        var candidates = boxes
            .Select(b => new
            {
                b.PartPath,
                Top = b.Bounds.Max[1],
                Width = b.Bounds.Max[0] - b.Bounds.Min[0],
                Depth = b.Bounds.Max[2] - b.Bounds.Min[2],
                MidX = (b.Bounds.Min[0] + b.Bounds.Max[0]) / 2,
                MidZ = (b.Bounds.Min[2] + b.Bounds.Max[2]) / 2,
            })
            .Where(c => c.Width * c.Depth >= MinimumAreaSquareMetres)
            .OrderBy(c => c.Top)
            .ToList();

        var surfaces = new List<AssetSurface>();
        var group = new List<(string PartPath, double Top, double Width, double Depth, double MidX, double MidZ)>();

        void Flush()
        {
            if (group.Count == 0)
            {
                return;
            }

            // The surface's own extent is the union of the parts at that height, not the sum
            // of their areas: two halves of one table top are one place to put a lamp.
            var minX = group.Min(g => g.MidX - (g.Width / 2));
            var maxX = group.Max(g => g.MidX + (g.Width / 2));
            var minZ = group.Min(g => g.MidZ - (g.Depth / 2));
            var maxZ = group.Max(g => g.MidZ + (g.Depth / 2));

            var width = maxX - minX;
            var depth = maxZ - minZ;
            var top = group.Max(g => g.Top);

            surfaces.Add(new AssetSurface(
                Round(top - baseY),
                Round(width * depth),
                new[] { Round(width), Round(depth) },
                new[]
                {
                    Round(((minX + maxX) / 2) - centerX),
                    Round(top - baseY),
                    Round(((minZ + maxZ) / 2) - centerZ),
                },
                group.Select(g => g.PartPath).OrderBy(p => p, StringComparer.Ordinal).ToList()));

            group.Clear();
        }

        foreach (var candidate in candidates)
        {
            if (group.Count > 0 && candidate.Top - group[^1].Top > HeightToleranceMetres)
            {
                Flush();
            }

            group.Add((candidate.PartPath, candidate.Top, candidate.Width, candidate.Depth, candidate.MidX, candidate.MidZ));
        }

        Flush();

        return surfaces
            .OrderByDescending(s => s.Area)
            .ThenByDescending(s => s.Height)
            .Take(MaxSurfaces)
            .ToList();
    }

    private static double Round(double value) => Math.Round(value, 4);
}
