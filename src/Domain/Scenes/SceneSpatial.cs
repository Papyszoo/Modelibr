namespace Domain.Scenes;

/// <summary>
/// The spatial facts about one library asset that placement reasoning needs, lifted out of
/// its derivation payload.
/// </summary>
/// <param name="WorldDimensions">Extent of the asset's world bounding box in metres, or null when it was never derived.</param>
/// <param name="OriginConvention">Where the asset's origin sits: <c>centered</c>, <c>bottom-center</c>, <c>corner</c>, or null when unclassified.</param>
/// <param name="OriginInBounds">
/// Where the asset's origin sits inside its own bounds, as a 0..1 fraction per axis
/// (0 = at the minimum face, 0.5 = centred, 1 = at the maximum face).
///
/// This is the measurement <see cref="OriginConvention"/> is a three-way label for, and it
/// wins wherever both are present: the label collapses everything that is not one of three
/// exact conventions to null, and a null label used to be read as "centred", which floated
/// every base-at-origin asset in the library by half its own height.
/// </param>
public sealed record SceneAssetFacts(
    string AssetType,
    int AssetId,
    int? VersionId,
    Vec3? WorldDimensions = null,
    string? OriginConvention = null,
    /// <summary>Modular-kit grid the asset snaps to, in metres, when the derive step found one.</summary>
    double? GridSize = null,
    Vec3? OriginInBounds = null);

/// <summary>An axis-aligned box in world space, metres.</summary>
public readonly record struct Aabb(Vec3 Min, Vec3 Max)
{
    public Vec3 Size => new(Max.X - Min.X, Max.Y - Min.Y, Max.Z - Min.Z);

    public Vec3 Center => new((Min.X + Max.X) / 2, (Min.Y + Max.Y) / 2, (Min.Z + Max.Z) / 2);

    public double LargestExtent => Math.Max(Size.X, Math.Max(Size.Y, Size.Z));

    /// <summary>
    /// True when the two boxes share volume. Touching faces do not count as an overlap -
    /// two walls placed flush against each other are the normal way to build a room, and
    /// reporting every one of them would make the check noise an agent learns to ignore.
    /// </summary>
    public bool Intersects(Aabb other, double tolerance = 0)
        => Min.X < other.Max.X - tolerance && Max.X > other.Min.X + tolerance
        && Min.Y < other.Max.Y - tolerance && Max.Y > other.Min.Y + tolerance
        && Min.Z < other.Max.Z - tolerance && Max.Z > other.Min.Z + tolerance;

    /// <summary>Volume the two boxes share, in cubic metres; 0 when they do not overlap.</summary>
    public double IntersectionVolume(Aabb other)
    {
        var x = Math.Min(Max.X, other.Max.X) - Math.Max(Min.X, other.Min.X);
        var y = Math.Min(Max.Y, other.Max.Y) - Math.Max(Min.Y, other.Min.Y);
        var z = Math.Min(Max.Z, other.Max.Z) - Math.Max(Min.Z, other.Min.Z);
        return x <= 0 || y <= 0 || z <= 0 ? 0 : x * y * z;
    }
}

/// <summary>A pair of nodes whose footprints share volume.</summary>
public sealed record SceneOverlap(string NodeIdA, string NodeIdB, double IntersectionVolume);

/// <summary>A node whose placed size looks wrong next to the rest of the scene.</summary>
public sealed record SceneScaleWarning(string NodeId, string Code, string Message);

/// <summary>
/// Spatial truth for an agent that cannot see.
///
/// Everything here is pure geometry over the document plus the derived per-asset facts, so
/// the same numbers back the MCP write-time checks, the read-back in <c>get_scene</c> and
/// the editor. Getting this wrong is not cosmetic: an agent placing a lamp post with a
/// centered origin onto y=0 buries it to its waist and has no way to notice.
/// </summary>
public static class SceneSpatial
{
    /// <summary>
    /// Overlap smaller than this is ignored. Placed geometry routinely grazes - a kerb
    /// against a road, a poster against a wall - and a check that fires on a cubic
    /// centimetre is a check nobody reads.
    /// </summary>
    public const double OverlapToleranceMetres = 0.01;

    /// <summary>
    /// How far apart two nodes' largest extents may be before the smaller one is called
    /// implausible. Deliberately loose: a city street legitimately holds a coffee cup and an
    /// apartment block, so this fires on the two-orders-of-magnitude mistakes (a chair the
    /// size of a stadium) rather than policing composition.
    /// </summary>
    public const double ScaleOutlierRatio = 100.0;

    /// <summary>
    /// The band that marks an asset as bounds-normalised rather than real-world sized. The
    /// base-meshes corpus is normalised to ~2 m on its longest axis, which is why an apple
    /// and an apartment arrive the same size and a scene built from them is uniformly wrong.
    /// </summary>
    public const double NormalizedSizeMin = 1.9;

    public const double NormalizedSizeMax = 2.1;

    /// <summary>
    /// The world-space box a node occupies, or null when the asset has no derived bounds
    /// (never extracted, or a family without geometry). Null is returned rather than a
    /// guessed unit box: a fabricated footprint would make the overlap check confidently
    /// wrong, which is worse than it reporting nothing.
    /// </summary>
    public static Aabb? Footprint(SceneNode node, SceneAssetFacts? facts)
    {
        var localSize = LocalSize(node, facts);
        if (localSize is not { } size)
        {
            return null;
        }

        var origin = node.Asset is not null
            ? OriginOffset(facts, size)
            // Primitives are authored centered, like three.js builds them.
            : new Vec3(-size.X / 2, -size.Y / 2, -size.Z / 2);

        var transform = node.Transform ?? SceneTransform.Identity;
        var scale = transform.Scale;

        // The eight corners of the local box, scaled and rotated, then re-bounded. Rotating
        // the corners rather than the extents keeps a 45°-turned building from reporting a
        // footprint smaller than it covers.
        var min = new Vec3(origin.X * scale.X, origin.Y * scale.Y, origin.Z * scale.Z);
        var max = new Vec3(
            (origin.X + size.X) * scale.X,
            (origin.Y + size.Y) * scale.Y,
            (origin.Z + size.Z) * scale.Z);

        var (rx, ry, rz) = (
            DegreesToRadians(transform.RotationEuler.X),
            DegreesToRadians(transform.RotationEuler.Y),
            DegreesToRadians(transform.RotationEuler.Z));

        double minX = double.MaxValue, minY = double.MaxValue, minZ = double.MaxValue;
        double maxX = double.MinValue, maxY = double.MinValue, maxZ = double.MinValue;

        for (var corner = 0; corner < 8; corner++)
        {
            var local = new Vec3(
                (corner & 1) == 0 ? min.X : max.X,
                (corner & 2) == 0 ? min.Y : max.Y,
                (corner & 4) == 0 ? min.Z : max.Z);

            var rotated = RotateXyz(local, rx, ry, rz);
            var world = new Vec3(
                rotated.X + transform.Position.X,
                rotated.Y + transform.Position.Y,
                rotated.Z + transform.Position.Z);

            minX = Math.Min(minX, world.X);
            minY = Math.Min(minY, world.Y);
            minZ = Math.Min(minZ, world.Z);
            maxX = Math.Max(maxX, world.X);
            maxY = Math.Max(maxY, world.Y);
            maxZ = Math.Max(maxZ, world.Z);
        }

        return new Aabb(new Vec3(minX, minY, minZ), new Vec3(maxX, maxY, maxZ));
    }

    /// <summary>
    /// Every pair of nodes sharing more than <see cref="OverlapToleranceMetres"/> cubed of
    /// volume, worst first. Nodes without derived bounds are skipped rather than assumed
    /// clear - an unreported pair is a gap in the check, not a pass.
    /// </summary>
    public static IReadOnlyList<SceneOverlap> FindOverlaps(
        IReadOnlyList<SceneNode> nodes,
        IReadOnlyDictionary<string, SceneAssetFacts> facts)
    {
        var boxes = new List<(string NodeId, Aabb Box)>();
        foreach (var node in nodes)
        {
            if (node?.Id is null || !node.Visible)
            {
                continue;
            }

            if (Footprint(node, FactsFor(node, facts)) is { } box)
            {
                boxes.Add((node.Id, box));
            }
        }

        var minimumVolume = Math.Pow(OverlapToleranceMetres, 3);
        var overlaps = new List<SceneOverlap>();

        for (var i = 0; i < boxes.Count; i++)
        {
            for (var j = i + 1; j < boxes.Count; j++)
            {
                if (!boxes[i].Box.Intersects(boxes[j].Box, OverlapToleranceMetres))
                {
                    continue;
                }

                var volume = boxes[i].Box.IntersectionVolume(boxes[j].Box);
                if (volume > minimumVolume)
                {
                    overlaps.Add(new SceneOverlap(boxes[i].NodeId, boxes[j].NodeId, volume));
                }
            }
        }

        return overlaps.OrderByDescending(o => o.IntersectionVolume).ToList();
    }

    /// <summary>
    /// Placed sizes that do not hang together, plus the normalisation trap: an asset whose
    /// source bounds sit in the ~2 m band was scaled to fit a preview, so placing it at
    /// scale 1 gives it a size that means nothing. Reported rather than corrected - only the
    /// user knows whether that apple should be 8 cm or a prop the size of a car.
    /// </summary>
    public static IReadOnlyList<SceneScaleWarning> FindScaleWarnings(
        IReadOnlyList<SceneNode> nodes,
        IReadOnlyDictionary<string, SceneAssetFacts> facts)
    {
        var warnings = new List<SceneScaleWarning>();
        var placed = new List<(string NodeId, double Extent)>();

        foreach (var node in nodes)
        {
            if (node?.Id is null || node.Asset is null)
            {
                continue;
            }

            var nodeFacts = FactsFor(node, facts);

            if (Footprint(node, nodeFacts) is { } box && box.LargestExtent > 0)
            {
                placed.Add((node.Id, box.LargestExtent));
            }

            if (nodeFacts?.WorldDimensions is { } dims)
            {
                var sourceExtent = Math.Max(dims.X, Math.Max(dims.Y, dims.Z));
                var scale = node.Transform?.Scale ?? Vec3.One;
                var uniformlyUnscaled =
                    Math.Abs(scale.X - 1) < 1e-6 && Math.Abs(scale.Y - 1) < 1e-6 && Math.Abs(scale.Z - 1) < 1e-6;

                if (uniformlyUnscaled && sourceExtent >= NormalizedSizeMin && sourceExtent <= NormalizedSizeMax)
                {
                    warnings.Add(new SceneScaleWarning(
                        node.Id,
                        "NormalizedSourceBounds",
                        FormattableString.Invariant(
                            $"'{node.Name ?? node.Id}' is {sourceExtent:0.##} m on its longest axis, which is the band bounds-normalised assets land in - its size is a preview artefact, not a real-world measurement. Set an explicit scale for the size this should actually be.")));
                }
            }
        }

        if (placed.Count >= 2)
        {
            var extents = placed.Select(p => p.Extent).OrderBy(e => e).ToList();
            var median = extents[extents.Count / 2];

            foreach (var (nodeId, extent) in placed)
            {
                var ratio = extent > median ? extent / median : median / extent;
                if (ratio > ScaleOutlierRatio)
                {
                    warnings.Add(new SceneScaleWarning(
                        nodeId,
                        "ImplausibleRelativeScale",
                        FormattableString.Invariant(
                            $"This node is {extent:0.##} m across while the scene's median is {median:0.##} m - a {ratio:0}× difference. Check the scale before treating this as intended.")));
                }
            }
        }

        return warnings;
    }

    /// <summary>
    /// The Y position that rests a node's base on <paramref name="groundY"/>, given how its
    /// origin sits inside its bounds. This is the call that stops "place it on the ground"
    /// from burying a centered-origin lamp post to its waist.
    ///
    /// Null when the asset has no derived bounds, because the honest answer is "I don't
    /// know where its feet are".
    /// </summary>
    public static double? GroundedY(SceneNode node, SceneAssetFacts? facts, double groundY = 0)
    {
        if (Footprint(node, facts) is not { } box)
        {
            return null;
        }

        var transform = node.Transform ?? SceneTransform.Identity;
        return transform.Position.Y + (groundY - box.Min.Y);
    }

    /// <summary>
    /// Positions for <paramref name="count"/> copies spaced evenly from
    /// <paramref name="start"/> to <paramref name="end"/> inclusive. A street is mostly
    /// repetition, and repetition an agent has to compute one position at a time is
    /// repetition it gets subtly wrong.
    /// </summary>
    public static IReadOnlyList<Vec3> DistributeAlongLine(Vec3 start, Vec3 end, int count)
    {
        if (count <= 0)
        {
            return Array.Empty<Vec3>();
        }

        if (count == 1)
        {
            return new[] { start };
        }

        var positions = new List<Vec3>(count);
        for (var i = 0; i < count; i++)
        {
            var t = (double)i / (count - 1);
            positions.Add(new Vec3(
                start.X + ((end.X - start.X) * t),
                start.Y + ((end.Y - start.Y) * t),
                start.Z + ((end.Z - start.Z) * t)));
        }

        return positions;
    }

    /// <summary>Rounds a position onto a grid - the alignment a modular kit needs to read as one continuous surface.</summary>
    public static Vec3 SnapToGrid(Vec3 position, double gridSize)
    {
        if (!double.IsFinite(gridSize) || gridSize <= 0)
        {
            return position;
        }

        return new Vec3(
            Math.Round(position.X / gridSize) * gridSize,
            Math.Round(position.Y / gridSize) * gridSize,
            Math.Round(position.Z / gridSize) * gridSize);
    }

    /// <summary>The facts key for a node's asset reference - family, id and pinned version.</summary>
    public static string FactsKey(SceneAssetRef asset) =>
        $"{asset.AssetType}:{asset.AssetId}:{asset.VersionId?.ToString() ?? "-"}";

    private static SceneAssetFacts? FactsFor(SceneNode node, IReadOnlyDictionary<string, SceneAssetFacts> facts) =>
        node.Asset is not null && facts.TryGetValue(FactsKey(node.Asset), out var found) ? found : null;

    /// <summary>The node's unscaled, unrotated extent: derived asset bounds, or the primitive's own size.</summary>
    private static Vec3? LocalSize(SceneNode node, SceneAssetFacts? facts)
    {
        if (node.Primitive is { } primitive)
        {
            return primitive.Size ?? Vec3.One;
        }

        var dims = facts?.WorldDimensions;
        return dims is { } d && d.IsFinite && d.X > 0 && d.Y > 0 && d.Z > 0 ? d : null;
    }

    /// <summary>
    /// Where the local box's minimum corner sits relative to the asset's origin.
    ///
    /// The measured fraction is preferred over the three-way label, and not as a nicety: an
    /// asset whose origin is at its base but off-centre in X matches no convention, so the
    /// label is null and the label path has to guess. Guessing is what put every piece of
    /// furniture in the library into the air by half its height.
    /// </summary>
    private static Vec3 OriginOffset(SceneAssetFacts? facts, Vec3 size)
    {
        if (facts?.OriginInBounds is { IsFinite: true } fraction)
        {
            return new Vec3(-fraction.X * size.X, -fraction.Y * size.Y, -fraction.Z * size.Z);
        }

        return facts?.OriginConvention switch
        {
            "bottom-center" => new Vec3(-size.X / 2, 0, -size.Z / 2),
            "corner" => Vec3.Zero,
            // "centered", and the unclassified case: an asset derived before origins were
            // measured. Centered is what a mesh exported without thought comes out as, and
            // it keeps the overlap and scale checks running on a library that has not been
            // re-derived yet - but it is a guess, and only the branch above is not.
            _ => new Vec3(-size.X / 2, -size.Y / 2, -size.Z / 2),
        };
    }

    private static double DegreesToRadians(double degrees) => degrees * Math.PI / 180.0;

    /// <summary>Intrinsic XYZ euler rotation, matching three.js's default order.</summary>
    private static Vec3 RotateXyz(Vec3 v, double rx, double ry, double rz)
    {
        var (cx, sx) = (Math.Cos(rx), Math.Sin(rx));
        var (cy, sy) = (Math.Cos(ry), Math.Sin(ry));
        var (cz, sz) = (Math.Cos(rz), Math.Sin(rz));

        var y1 = (v.Y * cx) - (v.Z * sx);
        var z1 = (v.Y * sx) + (v.Z * cx);

        var x2 = (v.X * cy) + (z1 * sy);
        var z2 = (-v.X * sy) + (z1 * cy);

        var x3 = (x2 * cz) - (y1 * sz);
        var y3 = (x2 * sz) + (y1 * cz);

        return new Vec3(x3, y3, z2);
    }
}
