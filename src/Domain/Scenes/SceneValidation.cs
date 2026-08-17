namespace Domain.Scenes;

/// <summary>
/// What a placed asset <i>is</i>, as opposed to how big it is.
///
/// <see cref="SceneAssetFacts"/> answers "where does this sit and how large is it", which is
/// enough to place something and not enough to notice that the thing being placed is a
/// twelve-object Khronos test scene containing a giraffe, two lights and a camera. That
/// mistake shipped a scene: a search hit named <c>carpet</c> was a 110-triangle part inside
/// <c>PlaysetLightTest</c>, its parent was placed, squashed to the part's dimensions, and
/// every spatial check passed.
/// </summary>
/// <param name="PartCount">How many parts the asset's scene graph has.</param>
/// <param name="CameraParts">Part paths whose object type is a camera - geometry-free, and a strong sign this is a sample scene.</param>
/// <param name="LightParts">Part paths whose object type is a light.</param>
/// <param name="MaterialCount">Distinct materials the asset declares, or null when it was never extracted.</param>
/// <param name="HasBoundTextureSet">Whether the asset itself already carries a texture set, independent of any scene binding.</param>
/// <param name="QualityFlags">The derive step's asset-level flags (<c>no_geometry</c>, <c>missing_uvs</c>, …).</param>
public sealed record SceneAssetProfile(
    string AssetType,
    int AssetId,
    int? VersionId,
    string? Name = null,
    int PartCount = 0,
    IReadOnlyList<string>? CameraParts = null,
    IReadOnlyList<string>? LightParts = null,
    int? MaterialCount = null,
    bool HasBoundTextureSet = false,
    IReadOnlyList<string>? QualityFlags = null)
{
    public IReadOnlyList<string> Cameras => CameraParts ?? Array.Empty<string>();

    public IReadOnlyList<string> Lights => LightParts ?? Array.Empty<string>();

    public IReadOnlyList<string> Flags => QualityFlags ?? Array.Empty<string>();
}

/// <summary>The groups a finding belongs to - the six things validation actually looks at.</summary>
public static class SceneChecks
{
    public const string Contact = "contact";
    public const string Containment = "containment";
    public const string Identity = "identity";
    public const string Orientation = "orientation";
    public const string Appearance = "appearance";
    public const string Scale = "scale";
    public const string Overlap = "overlap";
}

/// <summary>
/// How much a finding should stop the caller.
///
/// <see cref="Error"/> means the scene is wrong however it was meant - a node resting on
/// nothing, an anchor pointing at a node that is not there. <see cref="Warning"/> means it is
/// probably wrong and only the author knows. <see cref="Info"/> is a fact worth having that
/// is not a defect on its own, and never moves the verdict.
/// </summary>
public static class SceneFindingSeverities
{
    public const string Error = "error";
    public const string Warning = "warning";
    public const string Info = "info";
}

public static class SceneVerdicts
{
    public const string Ok = "ok";
    public const string Warnings = "warnings";
    public const string Errors = "errors";
}

/// <summary>One thing that is, or may be, wrong with a scene.</summary>
/// <param name="Check">Which of <see cref="SceneChecks"/> produced it.</param>
/// <param name="Code">Stable machine-readable identifier - what a caller branches on.</param>
/// <param name="NodeIds">The nodes involved; empty when the finding is about the scene as a whole.</param>
/// <param name="Message">What is wrong and what to do about it, in one sentence.</param>
public sealed record SceneFinding(
    string Check,
    string Code,
    string Severity,
    IReadOnlyList<string> NodeIds,
    string Message);

/// <summary>
/// What validation could and could not see.
///
/// Reported alongside the findings because the failure this whole tool exists to prevent was
/// an agent reading "no problems" as "the scene is right". A check that stays quiet about its
/// blind spots raises confidence in exactly the scenes it cannot judge.
/// </summary>
public sealed record SceneValidationCoverage(
    int NodeCount,
    int NodesWithBounds,
    IReadOnlyList<string> NodesWithoutBounds,
    IReadOnlyList<string> Limitations);

/// <summary>A scene's verdict, everything found, and what was not looked at.</summary>
public sealed record SceneValidationReport(
    string Verdict,
    IReadOnlyList<SceneFinding> Findings,
    SceneValidationCoverage Coverage);

/// <summary>
/// The checks that turn "the numbers look fine" into "here is what is wrong".
///
/// Pure over the document plus the derived per-asset facts and profiles, exactly like
/// <see cref="SceneSpatial"/> - same inputs, same numbers, no second geometry implementation.
///
/// Every check here corresponds to something that actually went wrong while building a real
/// scene through the MCP tools, and each one is a rule that could not be moved into the write
/// tools themselves: an asset legitimately floats (a hanging lamp), a node legitimately sits
/// on its side (a wall built from a floor panel), and a room legitimately has no lights while
/// it is still being blocked out. These are judgements, so they are reported rather than
/// enforced.
/// </summary>
public static class SceneValidator
{
    /// <summary>
    /// How far a resting node may sit off its surface before it counts as floating or sunk.
    /// One centimetre: below that is float noise from the placement arithmetic, above it is
    /// visible in a render.
    /// </summary>
    public const double ContactToleranceMetres = 0.01;

    /// <summary>How far a rotation may sit off a right angle before the node reads as tilted.</summary>
    public const double TiltToleranceDegrees = 0.5;

    /// <summary>
    /// Share of the smaller node's own volume that has to be inside the larger one before the
    /// pair is called interpenetrating rather than touching. Cushions on a sofa and legs on a
    /// rug overlap by design; half of one object being inside another does not happen on purpose.
    /// </summary>
    public const double InterpenetrationFraction = 0.5;

    /// <summary>
    /// How far outside the rest of the scene a node has to sit before it reads as a stray
    /// coordinate rather than composition. Relative to the scene's own size, with a floor, so
    /// it fires on a node at x=1000 and not on a wide street.
    /// </summary>
    public const double StrayNodeDistanceFactor = 3.0;

    public const double StrayNodeMinimumDistanceMetres = 10.0;

    public static SceneValidationReport Validate(
        SceneDocument document,
        IReadOnlyDictionary<string, SceneAssetFacts> facts,
        IReadOnlyDictionary<string, SceneAssetProfile>? profiles = null)
    {
        var findings = new List<SceneFinding>();

        var nodes = (document.Nodes ?? Array.Empty<SceneNode>())
            .Where(n => n?.Id is not null)
            .ToList();

        var boxes = new Dictionary<string, Aabb>(StringComparer.Ordinal);
        var withoutBounds = new List<string>();

        foreach (var node in nodes)
        {
            if (SceneSpatial.Footprint(node, FactsFor(node, facts)) is { } box)
            {
                boxes[node.Id] = box;
            }
            else
            {
                withoutBounds.Add(node.Id);
            }
        }

        var byId = nodes.ToDictionary(n => n.Id, n => n, StringComparer.Ordinal);

        // A hidden node is not in the picture, so it cannot hold anything up and cannot be
        // the thing something else is buried in.
        var visibleBoxes = boxes
            .Where(b => byId[b.Key].Visible)
            .ToDictionary(b => b.Key, b => b.Value, StringComparer.Ordinal);

        CheckContact(nodes, byId, boxes, visibleBoxes, findings);
        CheckContainment(nodes, visibleBoxes, findings);
        CheckIdentity(nodes, profiles, findings);
        CheckOrientation(nodes, findings);
        CheckAppearance(document, nodes, profiles, findings);
        CheckScale(nodes, facts, findings);
        CheckInterpenetration(nodes, visibleBoxes, findings);

        var verdict = findings.Any(f => f.Severity == SceneFindingSeverities.Error)
            ? SceneVerdicts.Errors
            : findings.Any(f => f.Severity == SceneFindingSeverities.Warning)
                ? SceneVerdicts.Warnings
                : SceneVerdicts.Ok;

        return new SceneValidationReport(
            verdict,
            Order(findings),
            new SceneValidationCoverage(
                nodes.Count,
                boxes.Count,
                withoutBounds,
                Limitations(withoutBounds.Count)));
    }

    /// <summary>
    /// Nodes that declare they are resting on something and are not, and nodes resting on
    /// nothing at all.
    ///
    /// The declared half should never fire - <see cref="SceneSpatial.ResolvePlacements"/> runs
    /// on every write and puts them there. It is here because a document can also arrive from
    /// an import, a hand edit or a build predating those rules, and "the invariant held when
    /// we wrote it" is not the same claim as "it holds now".
    /// </summary>
    private static void CheckContact(
        IReadOnlyList<SceneNode> nodes,
        IReadOnlyDictionary<string, SceneNode> byId,
        IReadOnlyDictionary<string, Aabb> boxes,
        IReadOnlyDictionary<string, Aabb> visibleBoxes,
        List<SceneFinding> findings)
    {
        foreach (var node in nodes)
        {
            if (!node.Visible)
            {
                continue;
            }

            if (node.Anchor is { } anchor)
            {
                if (!byId.ContainsKey(anchor.OnNodeId))
                {
                    findings.Add(new SceneFinding(
                        SceneChecks.Contact,
                        "Contact.AnchorMissing",
                        SceneFindingSeverities.Error,
                        new[] { node.Id },
                        $"'{Label(node)}' rests on node '{anchor.OnNodeId}', which is not in this scene - nothing is holding it up."));
                    continue;
                }

                if (!boxes.TryGetValue(node.Id, out var restingBox) ||
                    !boxes.TryGetValue(anchor.OnNodeId, out var supportBox))
                {
                    findings.Add(new SceneFinding(
                        SceneChecks.Contact,
                        "Contact.Unverifiable",
                        SceneFindingSeverities.Info,
                        new[] { node.Id },
                        $"'{Label(node)}' rests on '{anchor.OnNodeId}', but one of the two has no derived bounds, so the contact could not be measured."));
                    continue;
                }

                var expected = supportBox.Max.Y + (anchor.Offset?.Y ?? 0);
                var gap = restingBox.Min.Y - expected;
                if (Math.Abs(gap) > ContactToleranceMetres)
                {
                    findings.Add(new SceneFinding(
                        SceneChecks.Contact,
                        gap > 0 ? "Contact.AnchorFloating" : "Contact.AnchorSunk",
                        SceneFindingSeverities.Error,
                        new[] { node.Id, anchor.OnNodeId },
                        FormattableString.Invariant(
                            $"'{Label(node)}' says it rests on '{anchor.OnNodeId}' but its base is {Math.Abs(gap):0.###} m {(gap > 0 ? "above" : "below")} that surface.")));
                }

                continue;
            }

            if (!boxes.TryGetValue(node.Id, out var box))
            {
                continue;
            }

            if (node.GroundSnap is true)
            {
                if (Math.Abs(box.Min.Y) > ContactToleranceMetres)
                {
                    findings.Add(new SceneFinding(
                        SceneChecks.Contact,
                        box.Min.Y > 0 ? "Contact.GroundSnapFloating" : "Contact.GroundSnapSunk",
                        SceneFindingSeverities.Error,
                        new[] { node.Id },
                        FormattableString.Invariant(
                            $"'{Label(node)}' is set to rest on the floor but its base is at y={box.Min.Y:0.###} m.")));
                }

                continue;
            }

            // Nothing declared. Floating is legitimate - a pendant lamp, a bird - so this is
            // a warning naming the height, not a verdict on the placement.
            if (box.Min.Y > ContactToleranceMetres && !IsSupported(node.Id, box, visibleBoxes))
            {
                findings.Add(new SceneFinding(
                    SceneChecks.Contact,
                    "Contact.Unsupported",
                    SceneFindingSeverities.Warning,
                    new[] { node.Id },
                    FormattableString.Invariant(
                        $"'{Label(node)}' floats {box.Min.Y:0.###} m above the floor with nothing under it. Pass groundSnap=true to rest it on the floor, or on=\"<nodeId>\" to rest it on something.")));
            }
        }
    }

    /// <summary>True when some other node's top face reaches this node's base, under its footprint.</summary>
    private static bool IsSupported(string nodeId, Aabb box, IReadOnlyDictionary<string, Aabb> boxes)
    {
        foreach (var (otherId, other) in boxes)
        {
            if (string.Equals(otherId, nodeId, StringComparison.Ordinal))
            {
                continue;
            }

            var sharesGround =
                box.Min.X < other.Max.X && box.Max.X > other.Min.X &&
                box.Min.Z < other.Max.Z && box.Max.Z > other.Min.Z;

            if (sharesGround && other.Max.Y >= box.Min.Y - ContactToleranceMetres)
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>Geometry under the floor, and geometry nowhere near the rest of the scene.</summary>
    private static void CheckContainment(
        IReadOnlyList<SceneNode> nodes,
        IReadOnlyDictionary<string, Aabb> boxes,
        List<SceneFinding> findings)
    {
        foreach (var node in nodes.Where(n => n.Visible))
        {
            if (boxes.TryGetValue(node.Id, out var box) && box.Min.Y < -ContactToleranceMetres)
            {
                findings.Add(new SceneFinding(
                    SceneChecks.Containment,
                    "Containment.BelowFloor",
                    SceneFindingSeverities.Warning,
                    new[] { node.Id },
                    FormattableString.Invariant(
                        $"'{Label(node)}' reaches {-box.Min.Y:0.###} m below the floor plane. A wall or panel that hangs under y=0 is usually a centred origin that was not snapped.")));
            }
        }

        if (boxes.Count < 3)
        {
            return;
        }

        foreach (var (nodeId, box) in boxes)
        {
            var others = boxes.Where(b => !string.Equals(b.Key, nodeId, StringComparison.Ordinal)).Select(b => b.Value).ToList();
            var rest = Union(others);
            var threshold = Math.Max(StrayNodeMinimumDistanceMetres, StrayNodeDistanceFactor * rest.LargestExtent);
            var distance = DistanceOutside(box.Center, rest);

            if (distance > threshold)
            {
                var node = nodes.First(n => string.Equals(n.Id, nodeId, StringComparison.Ordinal));
                findings.Add(new SceneFinding(
                    SceneChecks.Containment,
                    "Containment.FarFromScene",
                    SceneFindingSeverities.Warning,
                    new[] { nodeId },
                    FormattableString.Invariant(
                        $"'{Label(node)}' sits {distance:0.#} m outside everything else in the scene - check its position for a stray coordinate.")));
            }
        }
    }

    /// <summary>
    /// Assets that are not the single prop they were placed as: sample scenes carrying their
    /// own cameras and lights, and assets with no geometry at all.
    /// </summary>
    private static void CheckIdentity(
        IReadOnlyList<SceneNode> nodes,
        IReadOnlyDictionary<string, SceneAssetProfile>? profiles,
        List<SceneFinding> findings)
    {
        if (profiles is null)
        {
            return;
        }

        foreach (var node in nodes)
        {
            if (node.Asset is not { } asset || !profiles.TryGetValue(SceneSpatial.FactsKey(asset), out var profile))
            {
                continue;
            }

            if (profile.Flags.Contains("no_geometry"))
            {
                findings.Add(new SceneFinding(
                    SceneChecks.Identity,
                    "Identity.NoGeometry",
                    SceneFindingSeverities.Error,
                    new[] { node.Id },
                    $"'{Label(node)}' references {asset.AssetType} {asset.AssetId}, which has no mesh - nothing will appear where it is placed."));
                continue;
            }

            var extras = profile.Cameras.Count + profile.Lights.Count;
            if (extras > 0)
            {
                var parts = string.Join(", ", profile.Cameras.Concat(profile.Lights).Take(3));
                findings.Add(new SceneFinding(
                    SceneChecks.Identity,
                    "Identity.ContainsNonGeometry",
                    SceneFindingSeverities.Warning,
                    new[] { node.Id },
                    $"'{Label(node)}' places {asset.AssetType} {asset.AssetId}, whose {profile.PartCount} parts include {profile.Cameras.Count} camera(s) and {profile.Lights.Count} light(s) ({parts}) - this is a whole sample scene, not a single prop. If a search hit named one part of it, that part is not what the asset id places."));
            }
        }
    }

    /// <summary>
    /// Nodes turned off the vertical. Yaw is deliberately not checked: turning something about
    /// Y is composition, and a node aimed with faceToward has an arbitrary yaw by design.
    /// </summary>
    private static void CheckOrientation(IReadOnlyList<SceneNode> nodes, List<SceneFinding> findings)
    {
        foreach (var node in nodes)
        {
            var rotation = (node.Transform ?? SceneTransform.Identity).RotationEuler;

            if (!IsRightAngle(rotation.X) || !IsRightAngle(rotation.Z))
            {
                findings.Add(new SceneFinding(
                    SceneChecks.Orientation,
                    "Orientation.Tilted",
                    SceneFindingSeverities.Warning,
                    new[] { node.Id },
                    FormattableString.Invariant(
                        $"'{Label(node)}' is tilted off the vertical (rotation x={rotation.X:0.##}°, z={rotation.Z:0.##}°). Furniture and walls are almost never meant to lean.")));
                continue;
            }

            if (IsQuarterTurn(rotation.X) || IsQuarterTurn(rotation.Z))
            {
                findings.Add(new SceneFinding(
                    SceneChecks.Orientation,
                    "Orientation.OnItsSide",
                    SceneFindingSeverities.Info,
                    new[] { node.Id },
                    FormattableString.Invariant(
                        $"'{Label(node)}' is turned onto its side (rotation x={rotation.X:0.##}°, z={rotation.Z:0.##}°). Right for a floor panel used as a wall; wrong for anything that stands up on its own.")));
                continue;
            }

            // A half turn about X or Z leaves the node's up axis pointing at the floor. Unlike
            // the quarter turn there is no modular-kit reading of it, so it is a warning.
            if (IsHalfTurn(rotation.X) || IsHalfTurn(rotation.Z))
            {
                findings.Add(new SceneFinding(
                    SceneChecks.Orientation,
                    "Orientation.UpsideDown",
                    SceneFindingSeverities.Warning,
                    new[] { node.Id },
                    FormattableString.Invariant(
                        $"'{Label(node)}' is upside down (rotation x={rotation.X:0.##}°, z={rotation.Z:0.##}°) - its up axis points at the floor.")));
            }
        }
    }

    /// <summary>
    /// Whether the scene will read as anything when it is rendered: is it lit, and is anything
    /// going to have a surface.
    /// </summary>
    private static void CheckAppearance(
        SceneDocument document,
        IReadOnlyList<SceneNode> nodes,
        IReadOnlyDictionary<string, SceneAssetProfile>? profiles,
        List<SceneFinding> findings)
    {
        var lights = document.Lights ?? Array.Empty<SceneLight>();
        var lit = lights.Where(l => l.Intensity > 0).ToList();
        var hasEnvironmentMap = document.Environment?.EnvironmentMap is not null;

        // An environment map lights a scene on its own, so it turns "unlit" from a defect
        // into a note. Without one, a scene with no key light has no form at all.
        var unlitSeverity = hasEnvironmentMap ? SceneFindingSeverities.Info : SceneFindingSeverities.Warning;

        if (nodes.Count > 0 && lit.Count == 0)
        {
            findings.Add(new SceneFinding(
                SceneChecks.Appearance,
                "Appearance.Unlit",
                unlitSeverity,
                Array.Empty<string>(),
                lights.Count == 0
                    ? "This scene has no lights. Add at least one directional or point light, or it renders as flat silhouettes."
                    : "Every light in this scene has zero intensity, which is the same as having none."));
        }
        else if (nodes.Count > 0 && !lit.Any(IsKeyLight))
        {
            findings.Add(new SceneFinding(
                SceneChecks.Appearance,
                "Appearance.AmbientOnly",
                unlitSeverity,
                Array.Empty<string>(),
                "This scene is lit only by ambient/hemisphere light. Ambient is fill: with no directional, point or spot light nothing casts shade and the render has no form."));
        }

        if (profiles is null)
        {
            return;
        }

        foreach (var node in nodes)
        {
            if (node.Asset is not { } asset || !profiles.TryGetValue(SceneSpatial.FactsKey(asset), out var profile))
            {
                continue;
            }

            var boundInScene = node.Material?.TextureSetId is not null;

            if (!boundInScene && !profile.HasBoundTextureSet && profile.MaterialCount is 0)
            {
                findings.Add(new SceneFinding(
                    SceneChecks.Appearance,
                    "Appearance.NoMaterial",
                    SceneFindingSeverities.Warning,
                    new[] { node.Id },
                    $"'{Label(node)}' declares no material and has no texture set bound, so it renders in the viewer's default grey."));
                continue;
            }

            if (!boundInScene && !profile.HasBoundTextureSet && profile.Flags.Contains("missing_uvs"))
            {
                findings.Add(new SceneFinding(
                    SceneChecks.Appearance,
                    "Appearance.MissingUvs",
                    SceneFindingSeverities.Info,
                    new[] { node.Id },
                    $"'{Label(node)}' has meshes without UVs, so binding a texture set to it will not show a texture until it is unwrapped."));
            }
        }
    }

    private static bool IsKeyLight(SceneLight light) =>
        light.Type is SceneLightTypes.Directional or SceneLightTypes.Point or SceneLightTypes.Spot;

    /// <summary>
    /// The existing placed-size warnings, restated as findings so one call answers "what is
    /// wrong with this scene" rather than two that have to be read together.
    /// </summary>
    private static void CheckScale(
        IReadOnlyList<SceneNode> nodes,
        IReadOnlyDictionary<string, SceneAssetFacts> facts,
        List<SceneFinding> findings)
    {
        foreach (var warning in SceneSpatial.FindScaleWarnings(nodes, facts))
        {
            findings.Add(new SceneFinding(
                SceneChecks.Scale,
                $"Scale.{warning.Code}",
                SceneFindingSeverities.Warning,
                new[] { warning.NodeId },
                warning.Message));
        }
    }

    /// <summary>
    /// Pairs where one node is mostly inside the other. Distinct from the raw overlap list on
    /// purpose: things that touch overlap constantly and that list is expected to be long, so
    /// the signal is the share of the smaller node that has disappeared inside the larger one.
    /// </summary>
    private static void CheckInterpenetration(
        IReadOnlyList<SceneNode> nodes,
        IReadOnlyDictionary<string, Aabb> boxes,
        List<SceneFinding> findings)
    {
        var visible = nodes.Where(n => n.Visible && boxes.ContainsKey(n.Id)).ToList();

        for (var i = 0; i < visible.Count; i++)
        {
            for (var j = i + 1; j < visible.Count; j++)
            {
                var a = boxes[visible[i].Id];
                var b = boxes[visible[j].Id];

                var shared = a.IntersectionVolume(b);
                if (shared <= 0)
                {
                    continue;
                }

                var smaller = Math.Min(Volume(a), Volume(b));
                if (smaller <= 0 || shared / smaller < InterpenetrationFraction)
                {
                    continue;
                }

                findings.Add(new SceneFinding(
                    SceneChecks.Overlap,
                    "Overlap.Interpenetrating",
                    SceneFindingSeverities.Warning,
                    new[] { visible[i].Id, visible[j].Id },
                    FormattableString.Invariant(
                        $"'{Label(visible[i])}' and '{Label(visible[j])}' share {shared / smaller:0%} of the smaller one's volume - they are inside each other, not resting against each other.")));
            }
        }
    }

    private static IReadOnlyList<string> Limitations(int nodesWithoutBounds)
    {
        var limitations = new List<string>
        {
            "Footprints are axis-aligned boxes. A square panel rotated 90° about Y has the same box as one that is not, so nothing here can see that a wall is facing the wrong way - render the scene and look at it.",
            "Nothing here judges composition, colour or whether the room reads as the thing it is meant to be.",
        };

        if (nodesWithoutBounds > 0)
        {
            limitations.Add(
                $"{nodesWithoutBounds} node(s) have no derived bounds, so contact, containment and overlap could not be checked for them. Re-derive those assets to close the gap.");
        }

        return limitations;
    }

    /// <summary>Errors first, then by check, so the caller reads the blocking ones without sorting.</summary>
    private static IReadOnlyList<SceneFinding> Order(IEnumerable<SceneFinding> findings) =>
        findings
            .OrderBy(f => f.Severity switch
            {
                SceneFindingSeverities.Error => 0,
                SceneFindingSeverities.Warning => 1,
                _ => 2,
            })
            .ThenBy(f => f.Check, StringComparer.Ordinal)
            .ThenBy(f => f.NodeIds.Count > 0 ? f.NodeIds[0] : string.Empty, StringComparer.Ordinal)
            .ToList();

    private static SceneAssetFacts? FactsFor(SceneNode node, IReadOnlyDictionary<string, SceneAssetFacts> facts) =>
        node.Asset is not null && facts.TryGetValue(SceneSpatial.FactsKey(node.Asset), out var found) ? found : null;

    private static string Label(SceneNode node) => node.Name ?? node.Id;

    private static double Volume(Aabb box) => Math.Max(0, box.Size.X) * Math.Max(0, box.Size.Y) * Math.Max(0, box.Size.Z);

    private static Aabb Union(IReadOnlyList<Aabb> boxes)
    {
        var min = new Vec3(
            boxes.Min(b => b.Min.X), boxes.Min(b => b.Min.Y), boxes.Min(b => b.Min.Z));
        var max = new Vec3(
            boxes.Max(b => b.Max.X), boxes.Max(b => b.Max.Y), boxes.Max(b => b.Max.Z));
        return new Aabb(min, max);
    }

    /// <summary>Distance from a point to a box; 0 when the point is inside it.</summary>
    private static double DistanceOutside(Vec3 point, Aabb box)
    {
        var dx = Math.Max(0, Math.Max(box.Min.X - point.X, point.X - box.Max.X));
        var dy = Math.Max(0, Math.Max(box.Min.Y - point.Y, point.Y - box.Max.Y));
        var dz = Math.Max(0, Math.Max(box.Min.Z - point.Z, point.Z - box.Max.Z));
        return Math.Sqrt((dx * dx) + (dy * dy) + (dz * dz));
    }

    private static bool IsRightAngle(double degrees)
    {
        var offset = Math.Abs(NormalizeDegrees(degrees) % 90);
        return offset < TiltToleranceDegrees || offset > 90 - TiltToleranceDegrees;
    }

    /// <summary>True for a rotation that lands on 90 or 270 - the one that tips a node over.</summary>
    private static bool IsQuarterTurn(double degrees)
    {
        var offset = Math.Abs((NormalizeDegrees(degrees) % 180) - 90);
        return offset < TiltToleranceDegrees;
    }

    /// <summary>True for a rotation that lands on 180 - the one that turns a node over.</summary>
    private static bool IsHalfTurn(double degrees) => Math.Abs(NormalizeDegrees(degrees) - 180) < TiltToleranceDegrees;

    private static double NormalizeDegrees(double degrees)
    {
        if (!double.IsFinite(degrees))
        {
            return 0;
        }

        var wrapped = degrees % 360;
        return wrapped < 0 ? wrapped + 360 : wrapped;
    }
}
