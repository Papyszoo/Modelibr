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

/// <summary>
/// How two overlapping footprints overlap. The AABB check finds real errors, but on its own
/// it cannot tell a cushion sitting on a sofa from a floor lamp inside an armchair - and a
/// scene that permanently reports "5 overlaps" with no way to rank them is a scene where the
/// one that matters is buried under four that are correct by construction.
/// </summary>
public static class SceneOverlapKinds
{
    /// <summary>
    /// One sits on the other: the shared volume is a thin slab at a horizontal contact plane.
    /// A cushion on a sofa, legs on a rug, a vase on a table.
    /// </summary>
    public const string Resting = "resting";

    /// <summary>
    /// One is almost entirely inside the other. For solid geometry this is the buried case -
    /// a prop inside a wall - and it is never right by accident.
    /// </summary>
    public const string Contained = "contained";

    /// <summary>Two volumes genuinely interpenetrating, neither resting nor contained.</summary>
    public const string Intersecting = "intersecting";

    public static readonly IReadOnlyList<string> All = new[] { Resting, Contained, Intersecting };
}

/// <summary>A pair of nodes whose footprints share volume, and what kind of sharing it is.</summary>
/// <param name="Kind">From <see cref="SceneOverlapKinds"/>.</param>
/// <param name="LikelyIntentional">
/// Whether this pair is probably fine. True for resting contact, for a declared anchor, and
/// for a graze small enough to be an axis-aligned box being larger than the rotated object
/// inside it. <b>A hint, not a verdict</b> - it exists so an agent can act on the two that
/// matter instead of re-reading five every time it writes.
/// </param>
public sealed record SceneOverlap(
    string NodeIdA,
    string NodeIdB,
    double IntersectionVolume,
    string Kind = SceneOverlapKinds.Intersecting,
    bool LikelyIntentional = false);

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
        var anchored = new HashSet<string>(StringComparer.Ordinal);

        foreach (var node in nodes)
        {
            if (node?.Id is null || !node.Visible)
            {
                continue;
            }

            // A declared anchor is the scene saying this pair touches on purpose. Recorded
            // both ways round so the classification does not depend on which of the two the
            // pair loop happens to reach first.
            if (node.Anchor is { OnNodeId: var target })
            {
                anchored.Add(PairKey(node.Id, target));
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
                    var (kind, intentional) = Classify(
                        boxes[i].Box,
                        boxes[j].Box,
                        volume,
                        anchored.Contains(PairKey(boxes[i].NodeId, boxes[j].NodeId)));

                    overlaps.Add(new SceneOverlap(boxes[i].NodeId, boxes[j].NodeId, volume, kind, intentional));
                }
            }
        }

        // Worst first still, but the ones that are probably fine sink below the ones that
        // are not - so the first entry an agent reads is the one worth acting on.
        return overlaps
            .OrderBy(o => o.LikelyIntentional)
            .ThenByDescending(o => o.IntersectionVolume)
            .ToList();
    }

    /// <summary>Order-independent key for a pair of node ids.</summary>
    private static string PairKey(string a, string b) =>
        string.CompareOrdinal(a, b) <= 0 ? $"{a}\u0000{b}" : $"{b}\u0000{a}";

    /// <summary>
    /// Fraction of the smaller box's volume that has to be shared before the pair reads as
    /// one thing inside another rather than two things touching.
    /// </summary>
    private const double ContainedFraction = 0.9;

    /// <summary>
    /// Below this fraction of the smaller box, a shared volume is a graze. It is the answer
    /// to rotation: a chair turned 55 degrees has an axis-aligned box much larger than the
    /// chair, so its near-misses read as collisions that are not there.
    /// </summary>
    private const double GrazeFraction = 0.02;

    /// <summary>
    /// How much of the shorter box's height the shared slab may take up and still read as
    /// resting on rather than sunk into. A quarter is generous on purpose: a pair only
    /// reaches this check once it has already penetrated past
    /// <see cref="OverlapToleranceMetres"/>, so a stricter figure would classify nothing.
    /// </summary>
    private const double RestingSlabFraction = 0.25;

    /// <summary>
    /// What kind of overlap this is, from the two boxes alone.
    ///
    /// Deliberately geometric and conservative. It cannot know that the two walls meeting at
    /// a corner are meant to; it can know that the shared volume is a thin slab at the top
    /// face of one box, which is what "resting on" looks like from the outside, and that a
    /// prop 95% inside a wall is not.
    /// </summary>
    private static (string Kind, bool LikelyIntentional) Classify(
        Aabb a, Aabb b, double sharedVolume, bool declaredAnchor)
    {
        var smaller = Math.Min(Volume(a), Volume(b));

        if (smaller <= 0)
        {
            return (SceneOverlapKinds.Intersecting, declaredAnchor);
        }

        var fraction = sharedVolume / smaller;

        if (fraction >= ContainedFraction)
        {
            // Containment is the one case a declared anchor cannot excuse: resting on
            // something does not put you inside it.
            return (SceneOverlapKinds.Contained, false);
        }

        if (declaredAnchor || RestsOn(a, b) || RestsOn(b, a))
        {
            return (SceneOverlapKinds.Resting, true);
        }

        return (SceneOverlapKinds.Intersecting, fraction < GrazeFraction);
    }

    /// <summary>
    /// Whether <paramref name="upper"/> is sitting on <paramref name="lower"/>.
    ///
    /// Three conditions together, and all three are needed. The shared slab has to be the top
    /// of the lower box against the bottom of the upper one; the upper box has to start above
    /// the lower one's floor, which is what separates "on the armchair" from "both standing on
    /// the floor and interpenetrating"; and the slab has to be thin relative to the shorter of
    /// the two, which is what separates "slightly sunk into the table" from "inside it".
    /// </summary>
    private static bool RestsOn(Aabb upper, Aabb lower)
    {
        var sharedMinY = Math.Max(upper.Min.Y, lower.Min.Y);
        var sharedMaxY = Math.Min(upper.Max.Y, lower.Max.Y);
        var sharedHeight = sharedMaxY - sharedMinY;
        var shorter = Math.Min(upper.Max.Y - upper.Min.Y, lower.Max.Y - lower.Min.Y);

        return shorter > 0
            && Math.Abs(sharedMaxY - lower.Max.Y) <= OverlapToleranceMetres
            && Math.Abs(sharedMinY - upper.Min.Y) <= OverlapToleranceMetres
            && upper.Min.Y > lower.Min.Y + OverlapToleranceMetres
            && sharedHeight <= shorter * RestingSlabFraction;
    }

    private static double Volume(Aabb box) =>
        Math.Max(0, box.Max.X - box.Min.X)
        * Math.Max(0, box.Max.Y - box.Min.Y)
        * Math.Max(0, box.Max.Z - box.Min.Z);

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
    /// The point something resting on this node sits on: the centre of its top face.
    /// Null when the node has no derived bounds, because there is then no top face to name.
    /// </summary>
    public static Vec3? AnchorReference(SceneNode node, SceneAssetFacts? facts) =>
        Footprint(node, facts) is { } box ? new Vec3(box.Center.X, box.Max.Y, box.Center.Z) : null;

    /// <summary>
    /// The world point of one of this node's <b>resting surfaces</b> - a table top, a sofa
    /// seat, a shelf board - given that surface's height above the asset's own base and the
    /// centre of its footprint relative to the asset's centre.
    ///
    /// Takes the three numbers rather than the derived surface record because the surfaces
    /// are read off part boxes in the Application layer, and the geometry that turns them
    /// into a world point belongs here with everything else that knows about origins,
    /// rotation and scale.
    ///
    /// This is what makes <c>place_asset(on:, onSurface:)</c> land on the seat rather than on
    /// the sofa's back: <see cref="AnchorReference"/> can only ever name the whole-asset box
    /// top, which is right by luck for a table and wrong for anything with structure.
    ///
    /// Null on the same terms as <see cref="Footprint"/> - no derived bounds, no surface.
    /// </summary>
    /// <param name="height">Metres above the asset's own base.</param>
    /// <param name="centerX">The surface centre's X, relative to the asset's centre, in the asset's own metres.</param>
    /// <param name="centerZ">The same on Z.</param>
    public static Vec3? SurfacePoint(
        SceneNode node,
        SceneAssetFacts? facts,
        double height,
        double centerX,
        double centerZ)
    {
        if (LocalSize(node, facts) is not { } size)
        {
            return null;
        }

        var origin = node.Asset is not null
            ? OriginOffset(facts, size)
            : new Vec3(-size.X / 2, -size.Y / 2, -size.Z / 2);

        var transform = node.Transform ?? SceneTransform.Identity;
        var scale = transform.Scale;

        // Scaled, then rotated, then translated - the same order the eight corners take in
        // Footprint, so a surface on a turned sofa lands where the sofa's own box says it is.
        var local = new Vec3(
            (origin.X + (size.X / 2) + centerX) * scale.X,
            (origin.Y + height) * scale.Y,
            (origin.Z + (size.Z / 2) + centerZ) * scale.Z);

        var rotated = RotateXyz(
            local,
            DegreesToRadians(transform.RotationEuler.X),
            DegreesToRadians(transform.RotationEuler.Y),
            DegreesToRadians(transform.RotationEuler.Z));

        return new Vec3(
            rotated.X + transform.Position.X,
            rotated.Y + transform.Position.Y,
            rotated.Z + transform.Position.Z);
    }

    /// <summary>This node's own contact point - the centre of its footprint, at its base.</summary>
    public static Vec3? ContactPoint(SceneNode node, SceneAssetFacts? facts) =>
        Footprint(node, facts) is { } box ? new Vec3(box.Center.X, box.Min.Y, box.Center.Z) : null;

    /// <summary>
    /// Moves a node so its contact point lands on <paramref name="target"/>, leaving its
    /// rotation and scale alone. The footprint is affine in the position, so the required
    /// move is exactly the difference between where the contact point is and where it should
    /// be - no search, and no assumption about which way the node is turned.
    /// </summary>
    public static SceneNode? WithContactAt(SceneNode node, SceneAssetFacts? facts, Vec3 target)
    {
        if (ContactPoint(node, facts) is not { } contact)
        {
            return null;
        }

        var transform = node.Transform ?? SceneTransform.Identity;
        return node with
        {
            Transform = transform with
            {
                Position = new Vec3(
                    transform.Position.X + (target.X - contact.X),
                    transform.Position.Y + (target.Y - contact.Y),
                    transform.Position.Z + (target.Z - contact.Z)),
            },
        };
    }

    /// <summary>
    /// The Y rotation, in degrees, that turns <paramref name="frontAxis"/> to point from
    /// <paramref name="from"/> towards <paramref name="toward"/>.
    ///
    /// Which axis is an asset's front is not derivable from anything the library stores, so
    /// it is declared rather than guessed - but the trigonometry after that is exactly the
    /// part an agent gets wrong, and it is the same for every asset. Null when the two points
    /// share a spot on the ground plane, because "face yourself" has no answer.
    /// </summary>
    public static double? FacingYawDegrees(Vec3 from, Vec3 toward, string? frontAxis)
    {
        if (SceneFrontAxes.Direction(frontAxis ?? SceneFrontAxes.Default) is not { } axis)
        {
            return null;
        }

        var dx = toward.X - from.X;
        var dz = toward.Z - from.Z;
        if (!double.IsFinite(dx) || !double.IsFinite(dz) || (Math.Abs(dx) < 1e-9 && Math.Abs(dz) < 1e-9))
        {
            return null;
        }

        // Yaw rotates the front axis in the XZ plane; the rotation needed is the angle
        // between where the axis points and where the target is.
        var yaw = (Math.Atan2(axis.Z, axis.X) - Math.Atan2(dz, dx)) * 180.0 / Math.PI;

        // Normalised to (-180, 180] so a facing change reads as a small number in the
        // response rather than as 1080 degrees accumulated over four calls.
        yaw %= 360;
        return yaw switch
        {
            > 180 => yaw - 360,
            <= -180 => yaw + 360,
            _ => yaw,
        };
    }

    /// <summary>
    /// Applies the placement rules a node carries with it: an anchor keeps it resting on the
    /// node below, a facing point keeps it turned towards something, and a sticky ground snap
    /// keeps it on the floor.
    ///
    /// Run on the candidate document of every write, so the rules hold no matter which tool
    /// (or the editor) produced it. <paramref name="current"/> is the stored document this
    /// write started from, and it is what tells an anchor that moved from an anchored node
    /// that was dragged: if the node moved and the thing it rests on did not, the caller
    /// repositioned it on that surface and the offset is re-captured rather than undone.
    /// </summary>
    public static SceneDocument ResolvePlacements(
        SceneDocument current,
        SceneDocument candidate,
        IReadOnlyDictionary<string, SceneAssetFacts> facts)
    {
        if (candidate.Nodes is not { Count: > 0 } nodes)
        {
            return candidate;
        }

        var resolved = nodes.ToArray();
        var indexById = new Dictionary<string, int>(StringComparer.Ordinal);
        for (var i = 0; i < resolved.Length; i++)
        {
            if (resolved[i]?.Id is { } id)
            {
                indexById.TryAdd(id, i);
            }
        }

        var stored = new Dictionary<string, SceneNode>(StringComparer.Ordinal);
        foreach (var node in current.Nodes ?? Array.Empty<SceneNode>())
        {
            if (node?.Id is { } id)
            {
                stored.TryAdd(id, node);
            }
        }

        var changed = false;

        foreach (var index in DependencyOrder(resolved, indexById))
        {
            var node = resolved[index];
            if (node is null)
            {
                continue;
            }

            var placed = Resolve(node, resolved, indexById, stored, facts);

            if (!ReferenceEquals(placed, node))
            {
                resolved[index] = placed;
                changed = true;
            }
        }

        return changed ? candidate with { Nodes = resolved } : candidate;
    }

    /// <summary>
    /// One node's rules, in the order they depend on each other: where it should sit, then
    /// which way it should point from there, then the move that puts it there.
    ///
    /// Facing is resolved from the seat rather than from the node's current position, because
    /// "put the TV on the console facing the sofa" arrives as one call and the position it
    /// carries is whatever the caller happened to pass - usually the origin.
    ///
    /// A node whose anchor names something that is not here, or that has no derived bounds,
    /// is left exactly where it is. An anchor that cannot be resolved is a reason not to
    /// invent a placement, not a reason to drop the node on the floor.
    /// </summary>
    private static SceneNode Resolve(
        SceneNode node,
        IReadOnlyList<SceneNode> nodes,
        IReadOnlyDictionary<string, int> indexById,
        IReadOnlyDictionary<string, SceneNode> stored,
        IReadOnlyDictionary<string, SceneAssetFacts> facts)
    {
        var nodeFacts = FactsFor(node, facts);
        var anchor = node.Anchor;
        Vec3? seat = null;

        if (anchor is not null &&
            indexById.TryGetValue(anchor.OnNodeId, out var targetIndex) &&
            nodes[targetIndex] is { } target &&
            AnchorReference(target, FactsFor(target, facts)) is { } reference)
        {
            var offset = anchor.Offset;
            var contact = ContactPoint(node, nodeFacts);

            if (offset is null)
            {
                // Attaching without a stated offset: keep the node over the same spot and rest
                // it on the surface. Capturing the height too would attach a node that was
                // sitting on the floor at floor height and call it "on the table".
                offset = contact is { } c ? new Vec3(c.X - reference.X, 0, c.Z - reference.Z) : null;
            }
            else if (contact is { } moved && RepositionedOnTheSameSurface(node, anchor, reference, stored, facts))
            {
                // The node was repositioned while the surface stayed put, so this is somebody
                // arranging things on it. The height is captured this time: a stated position
                // is a stated position, and "on the shelf" needs to be expressible.
                offset = new Vec3(moved.X - reference.X, moved.Y - reference.Y, moved.Z - reference.Z);

                // And the surface label goes with it. It says which face the offset was
                // measured from, and the offset it described is the one just overwritten -
                // a node dragged off the seat would otherwise keep claiming to be on it.
                anchor = anchor with { Surface = null };
            }

            if (offset is { } resolvedOffset)
            {
                seat = new Vec3(
                    reference.X + resolvedOffset.X,
                    reference.Y + resolvedOffset.Y,
                    reference.Z + resolvedOffset.Z);
                anchor = anchor with { Offset = resolvedOffset };
            }
        }

        var placed = node;
        var transform = node.Transform ?? SceneTransform.Identity;

        if (node.FaceToward is { } facing)
        {
            var from = seat ?? ContactPoint(node, nodeFacts) ?? transform.Position;
            if (FacingYawDegrees(from, facing, node.FrontAxis) is { } yaw)
            {
                placed = placed with
                {
                    Transform = transform with { RotationEuler = transform.RotationEuler with { Y = yaw } },
                };
            }
        }

        if (seat is { } contactTarget)
        {
            return (WithContactAt(placed, nodeFacts, contactTarget) ?? placed) with { Anchor = anchor };
        }

        // Only when nothing is holding it up: an anchored node whose anchor could not be
        // resolved must not be quietly dropped to the floor instead.
        if (node.Anchor is null && node.GroundSnap is true && GroundedY(placed, nodeFacts) is { } groundedY)
        {
            var current = placed.Transform ?? SceneTransform.Identity;
            return Math.Abs(current.Position.Y - groundedY) < 1e-9
                ? placed
                : placed with { Transform = current with { Position = current.Position with { Y = groundedY } } };
        }

        return placed;
    }

    /// <summary>
    /// True when this write moved the node itself while the surface under it stayed put -
    /// which is somebody repositioning it on that surface, not the anchor pulling it along.
    /// A write that changes the anchor is excluded: the offset it arrived with is the
    /// caller's instruction, and re-capturing would immediately discard it.
    /// </summary>
    private static bool RepositionedOnTheSameSurface(
        SceneNode node,
        SceneAnchor anchor,
        Vec3 reference,
        IReadOnlyDictionary<string, SceneNode> stored,
        IReadOnlyDictionary<string, SceneAssetFacts> facts)
    {
        if (!stored.TryGetValue(node.Id, out var previous) || previous.Anchor != anchor)
        {
            return false;
        }

        if (!stored.TryGetValue(anchor.OnNodeId, out var previousTarget) ||
            AnchorReference(previousTarget, FactsFor(previousTarget, facts)) is not { } previousReference ||
            !Approximately(previousReference, reference))
        {
            return false;
        }

        return !Approximately(
            (previous.Transform ?? SceneTransform.Identity).Position,
            (node.Transform ?? SceneTransform.Identity).Position);
    }

    private static bool Approximately(Vec3 a, Vec3 b) =>
        Math.Abs(a.X - b.X) < 1e-9 && Math.Abs(a.Y - b.Y) < 1e-9 && Math.Abs(a.Z - b.Z) < 1e-9;

    /// <summary>
    /// Node indexes ordered so anything an anchor points at is resolved before the node
    /// resting on it - a book on a tray on a table has to settle in that order.
    ///
    /// Nodes caught in an anchor cycle are still emitted, because this only decides an order:
    /// rejecting the cycle is <see cref="SceneDocumentValidator"/>'s job, and it runs on the
    /// document this produces.
    /// </summary>
    private static IEnumerable<int> DependencyOrder(
        IReadOnlyList<SceneNode> nodes,
        IReadOnlyDictionary<string, int> indexById)
    {
        var state = new byte[nodes.Count];
        var order = new List<int>(nodes.Count);
        var stack = new Stack<int>();

        for (var start = 0; start < nodes.Count; start++)
        {
            if (state[start] != 0)
            {
                continue;
            }

            stack.Push(start);
            while (stack.Count > 0)
            {
                var index = stack.Peek();

                if (state[index] == 0)
                {
                    state[index] = 1;

                    if (nodes[index]?.Anchor is { } anchor &&
                        indexById.TryGetValue(anchor.OnNodeId, out var target) &&
                        state[target] == 0)
                    {
                        stack.Push(target);
                        continue;
                    }
                }

                stack.Pop();
                if (state[index] != 2)
                {
                    state[index] = 2;
                    order.Add(index);
                }
            }
        }

        return order;
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
