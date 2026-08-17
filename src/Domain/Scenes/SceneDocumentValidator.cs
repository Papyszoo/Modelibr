namespace Domain.Scenes;

/// <summary>One thing wrong with a document, addressed by a JSON-pointer-ish path.</summary>
/// <param name="Path">Where the problem is, e.g. <c>nodes[3].asset.versionId</c>.</param>
/// <param name="Code">Stable machine code, so an agent can branch on it without parsing prose.</param>
/// <param name="Message">What a human (or an agent) needs to fix it.</param>
public sealed record SceneValidationIssue(string Path, string Code, string Message);

/// <summary>
/// Validates a scene document against the contract.
///
/// Every caller-supplied document goes through this: the REST endpoint, every MCP scene
/// tool, and the editor's save. A document that fails is <b>rejected</b> - never repaired,
/// never silently replaced with an empty scene. The feature this replaces parsed its
/// config with a bare <c>JSON.parse</c> in a try/catch and handed the user an empty stage
/// with a toast, which loses a scene and tells the user it started fresh.
///
/// Pure and dependency-free so the rules are unit-testable without a database, an HTTP
/// request or a serializer.
/// </summary>
public static class SceneDocumentValidator
{
    /// <summary>
    /// Ceiling on node count. Not a performance limit so much as a "something has gone
    /// wrong" limit: an agent in a loop is the realistic way a scene reaches five figures,
    /// and failing that write is kinder than persisting it.
    /// </summary>
    public const int MaxNodes = 5000;

    public const int MaxLights = 200;

    /// <summary>Longest accepted node/slot/light id.</summary>
    public const int MaxIdLength = 128;

    /// <summary>
    /// Smallest accepted absolute scale factor on any axis. A zero scale collapses geometry
    /// to nothing and reads as an invisible node rather than an error; a negative one mirrors
    /// it, which is legal but must be deliberate, so only the magnitude is floored.
    /// </summary>
    public const double MinAbsScale = 1e-4;

    /// <summary>Largest accepted absolute coordinate, in metres - past this, floating-point precision degrades visibly.</summary>
    public const double MaxCoordinate = 1e6;

    public static IReadOnlyList<SceneValidationIssue> Validate(SceneDocument? document)
    {
        var issues = new List<SceneValidationIssue>();

        if (document is null)
        {
            issues.Add(new SceneValidationIssue(
                "", "DocumentMissing", "The scene document is missing."));
            return issues;
        }

        if (document.SchemaVersion != SceneDocument.CurrentSchemaVersion)
        {
            issues.Add(new SceneValidationIssue(
                "schemaVersion",
                "UnsupportedSchemaVersion",
                $"Scene schema version {document.SchemaVersion} is not supported by this server, which reads version {SceneDocument.CurrentSchemaVersion}."));

            // Every rule below is a rule of *this* version. Checking them against a document
            // written for another version would report invented problems, so stop here.
            return issues;
        }

        ValidateStage(document, issues);
        ValidateNodes(document, issues);
        ValidateLights(document, issues);
        ValidateEnvironment(document, issues);

        return issues;
    }

    /// <summary>
    /// The stage, when one is declared, has to be one of the four. A typo would otherwise
    /// rank as no stage at all, which reads as "not authored in stages" - and silently
    /// un-gates the write the caller was trying to gate.
    /// </summary>
    private static void ValidateStage(SceneDocument document, List<SceneValidationIssue> issues)
    {
        if (document.Stage is not null && !SceneStages.IsStage(document.Stage))
        {
            issues.Add(new SceneValidationIssue(
                "stage",
                "UnknownStage",
                $"'{document.Stage}' is not a scene stage. Use one of: {string.Join(", ", SceneStages.All)} - or omit it to author the scene without stages."));
        }
    }

    private static void ValidateNodes(SceneDocument document, List<SceneValidationIssue> issues)
    {
        if (document.Nodes is null)
        {
            issues.Add(new SceneValidationIssue("nodes", "NodesMissing", "The 'nodes' array is required (use [] for an empty scene)."));
            return;
        }

        if (document.Nodes.Count > MaxNodes)
        {
            issues.Add(new SceneValidationIssue(
                "nodes", "TooManyNodes", $"A scene may hold at most {MaxNodes} nodes; this document has {document.Nodes.Count}."));
        }

        var seenIds = new HashSet<string>(StringComparer.Ordinal);

        for (var i = 0; i < document.Nodes.Count; i++)
        {
            var node = document.Nodes[i];
            var path = $"nodes[{i}]";

            if (node is null)
            {
                issues.Add(new SceneValidationIssue(path, "NodeMissing", "A node entry is null."));
                continue;
            }

            ValidateId(node.Id, $"{path}.id", "Node", issues);

            if (!string.IsNullOrEmpty(node.Id) && !seenIds.Add(node.Id))
            {
                issues.Add(new SceneValidationIssue(
                    $"{path}.id",
                    "DuplicateNodeId",
                    $"Node id '{node.Id}' is used more than once. Ids address nodes for edits and undo, so they must be unique."));
            }

            if (node.SlotId is not null)
            {
                ValidateId(node.SlotId, $"{path}.slotId", "Slot", issues);
            }

            var hasAsset = node.Asset is not null;
            var hasPrimitive = node.Primitive is not null;

            if (hasAsset == hasPrimitive)
            {
                issues.Add(new SceneValidationIssue(
                    path,
                    "NodeContentAmbiguous",
                    hasAsset
                        ? "A node references both a library asset and a primitive; it must be exactly one."
                        : "A node references neither a library asset nor a primitive; it must be exactly one."));
            }

            if (node.Asset is not null)
            {
                ValidateAssetRef(node.Asset, $"{path}.asset", issues);
            }

            if (node.Primitive is not null)
            {
                ValidatePrimitive(node.Primitive, $"{path}.primitive", issues);
            }

            ValidateTransform(node.Transform, $"{path}.transform", issues);

            if (node.Material?.TextureSetId is <= 0)
            {
                issues.Add(new SceneValidationIssue(
                    $"{path}.material.textureSetId", "InvalidTextureSetId", "A texture set id must be a positive integer."));
            }

            if (node.FrontAxis is not null && SceneFrontAxes.Direction(node.FrontAxis) is null)
            {
                issues.Add(new SceneValidationIssue(
                    $"{path}.frontAxis",
                    "UnknownFrontAxis",
                    $"'{node.FrontAxis}' is not a front axis. Known axes: {string.Join(", ", SceneFrontAxes.All)} - Y is excluded because facing is a rotation about it."));
            }

            if (node.Anchor is { } anchor)
            {
                ValidateAnchor(node, anchor, $"{path}.anchor", issues);
            }

            // Three answers to "what holds this up", and they contradict each other. Picking
            // one silently would leave the caller believing something the scene does not do.
            if (node.Suspended is true && (node.GroundSnap is true || node.Anchor is not null))
            {
                issues.Add(new SceneValidationIssue(
                    $"{path}.suspended",
                    "SuspendedAndSupported",
                    node.GroundSnap is true
                        ? "A node cannot be suspended and ground-snapped at once. Drop groundSnap to hang it, or drop suspended to rest it on the floor."
                        : "A node cannot be suspended and resting on another node at once. Detach the anchor to hang it, or drop suspended to leave it resting."));
            }
        }

        ValidateAnchorGraph(document.Nodes, issues);
    }

    private static void ValidateAnchor(
        SceneNode node,
        SceneAnchor anchor,
        string path,
        List<SceneValidationIssue> issues)
    {
        ValidateId(anchor.OnNodeId, $"{path}.onNodeId", "Node", issues);

        if (string.Equals(anchor.OnNodeId, node.Id, StringComparison.Ordinal))
        {
            issues.Add(new SceneValidationIssue(
                $"{path}.onNodeId", "SelfAnchor", $"Node '{node.Id}' cannot rest on itself."));
        }

        if (anchor.Offset is { } offset)
        {
            ValidateVec3(offset, $"{path}.offset", issues);
        }
    }

    /// <summary>
    /// The rules that are about the anchors as a graph rather than one at a time: an anchor
    /// must name a node that is here, and the chain must end somewhere.
    ///
    /// A cycle is rejected rather than broken arbitrarily. Two nodes resting on each other
    /// have no resolvable height, and picking one to win would place them somewhere neither
    /// caller asked for and report success.
    /// </summary>
    private static void ValidateAnchorGraph(IReadOnlyList<SceneNode> nodes, List<SceneValidationIssue> issues)
    {
        var indexById = new Dictionary<string, int>(StringComparer.Ordinal);
        for (var i = 0; i < nodes.Count; i++)
        {
            if (nodes[i]?.Id is { } id)
            {
                indexById.TryAdd(id, i);
            }
        }

        // The index a node rests on, or -1. Self-anchors count as no successor: they are
        // already reported as SelfAnchor, and walking one would say the same thing again in
        // the vocabulary of cycles.
        int Anchor(int index)
        {
            var node = nodes[index];
            if (node?.Anchor is not { } anchor ||
                string.IsNullOrWhiteSpace(anchor.OnNodeId) ||
                string.Equals(anchor.OnNodeId, node.Id, StringComparison.Ordinal))
            {
                return -1;
            }

            if (!indexById.TryGetValue(anchor.OnNodeId, out var target))
            {
                issues.Add(new SceneValidationIssue(
                    $"nodes[{index}].anchor.onNodeId",
                    "AnchorNodeNotFound",
                    $"Node '{node.Id}' rests on '{anchor.OnNodeId}', which is not a node in this scene."));
                return -1;
            }

            return target;
        }

        // Every node has at most one anchor, so the graph is a forest of chains and the walk
        // is linear: follow each chain once, marking it, and a chain that re-enters a node
        // still on the current path is a cycle. Walking from every node instead would be
        // quadratic on a long stack of anchors, which a scene is allowed to have.
        var state = new byte[nodes.Count];
        var path = new List<int>();

        for (var start = 0; start < nodes.Count; start++)
        {
            if (state[start] != 0)
            {
                continue;
            }

            path.Clear();
            var current = start;

            while (current >= 0 && state[current] == 0)
            {
                state[current] = 1;
                path.Add(current);
                current = Anchor(current);
            }

            if (current >= 0 && state[current] == 1)
            {
                issues.Add(new SceneValidationIssue(
                    $"nodes[{current}].anchor.onNodeId",
                    "AnchorCycle",
                    $"Node '{nodes[current]!.Id}' is in a cycle of anchors. Nodes resting on each other have no resolvable height."));
            }

            foreach (var visited in path)
            {
                state[visited] = 2;
            }
        }
    }

    private static void ValidateAssetRef(SceneAssetRef asset, string path, List<SceneValidationIssue> issues)
    {
        if (!SceneAssetTypes.IsPlaceable(asset.AssetType))
        {
            issues.Add(new SceneValidationIssue(
                $"{path}.assetType",
                "UnplaceableAssetType",
                $"'{asset.AssetType}' cannot be placed in a scene. Placeable families: {string.Join(", ", SceneAssetTypes.All)}."));
        }

        if (asset.AssetId <= 0)
        {
            issues.Add(new SceneValidationIssue($"{path}.assetId", "InvalidAssetId", "An asset id must be a positive integer."));
        }

        // The pin. Without it a scene re-points itself when the model gets a new version,
        // and the user's composed scene changes because somebody re-uploaded a mesh.
        if (SceneAssetTypes.RequiresVersion(asset.AssetType))
        {
            if (asset.VersionId is null)
            {
                issues.Add(new SceneValidationIssue(
                    $"{path}.versionId",
                    "VersionRequired",
                    $"{asset.AssetType} nodes must pin a versionId. An unpinned node would silently re-point when the asset gets a new version."));
            }
            else if (asset.VersionId <= 0)
            {
                issues.Add(new SceneValidationIssue(
                    $"{path}.versionId", "InvalidVersionId", "A version id must be a positive integer."));
            }
        }
        else if (asset.VersionId is not null)
        {
            issues.Add(new SceneValidationIssue(
                $"{path}.versionId",
                "VersionNotApplicable",
                $"{asset.AssetType} assets are not versioned, so versionId must be omitted."));
        }
    }

    private static void ValidatePrimitive(ScenePrimitive primitive, string path, List<SceneValidationIssue> issues)
    {
        if (!ScenePrimitiveShapes.All.Contains(primitive.Shape, StringComparer.Ordinal))
        {
            issues.Add(new SceneValidationIssue(
                $"{path}.shape",
                "UnknownPrimitiveShape",
                $"'{primitive.Shape}' is not a known primitive. Known shapes: {string.Join(", ", ScenePrimitiveShapes.All)}."));
        }

        if (primitive.Size is { } size)
        {
            ValidateVec3(size, $"{path}.size", issues, requirePositive: true);
        }
    }

    private static void ValidateTransform(SceneTransform? transform, string path, List<SceneValidationIssue> issues)
    {
        if (transform is null)
        {
            issues.Add(new SceneValidationIssue(path, "TransformMissing", "A node requires a transform."));
            return;
        }

        ValidateVec3(transform.Position, $"{path}.position", issues);
        ValidateVec3(transform.RotationEuler, $"{path}.rotationEuler", issues, maxMagnitude: 36000);
        ValidateVec3(transform.Scale, $"{path}.scale", issues);

        var scale = transform.Scale;
        if (scale.IsFinite &&
            (Math.Abs(scale.X) < MinAbsScale || Math.Abs(scale.Y) < MinAbsScale || Math.Abs(scale.Z) < MinAbsScale))
        {
            issues.Add(new SceneValidationIssue(
                $"{path}.scale",
                "DegenerateScale",
                $"A scale axis is smaller than {MinAbsScale}, which collapses the node to nothing. Note that omitting 'scale' is not the same as 1,1,1 - it reads as 0,0,0."));
        }
    }

    private static void ValidateVec3(
        Vec3 value,
        string path,
        List<SceneValidationIssue> issues,
        bool requirePositive = false,
        double maxMagnitude = MaxCoordinate)
    {
        if (!value.IsFinite)
        {
            issues.Add(new SceneValidationIssue(
                path, "NonFiniteNumber", "Coordinates must be finite numbers (NaN and Infinity are not scene positions)."));
            return;
        }

        if (Math.Abs(value.X) > maxMagnitude || Math.Abs(value.Y) > maxMagnitude || Math.Abs(value.Z) > maxMagnitude)
        {
            issues.Add(new SceneValidationIssue(
                path, "CoordinateOutOfRange", $"Values must stay within ±{maxMagnitude:G}."));
        }

        if (requirePositive && (value.X <= 0 || value.Y <= 0 || value.Z <= 0))
        {
            issues.Add(new SceneValidationIssue(path, "NonPositiveSize", "A size must be positive on every axis."));
        }
    }

    private static void ValidateLights(SceneDocument document, List<SceneValidationIssue> issues)
    {
        if (document.Lights is null)
        {
            issues.Add(new SceneValidationIssue("lights", "LightsMissing", "The 'lights' array is required (use [] for none)."));
            return;
        }

        if (document.Lights.Count > MaxLights)
        {
            issues.Add(new SceneValidationIssue(
                "lights", "TooManyLights", $"A scene may hold at most {MaxLights} lights; this document has {document.Lights.Count}."));
        }

        var seenIds = new HashSet<string>(StringComparer.Ordinal);

        for (var i = 0; i < document.Lights.Count; i++)
        {
            var light = document.Lights[i];
            var path = $"lights[{i}]";

            if (light is null)
            {
                issues.Add(new SceneValidationIssue(path, "LightMissing", "A light entry is null."));
                continue;
            }

            ValidateId(light.Id, $"{path}.id", "Light", issues);

            if (!string.IsNullOrEmpty(light.Id) && !seenIds.Add(light.Id))
            {
                issues.Add(new SceneValidationIssue($"{path}.id", "DuplicateLightId", $"Light id '{light.Id}' is used more than once."));
            }

            if (!SceneLightTypes.All.Contains(light.Type, StringComparer.Ordinal))
            {
                issues.Add(new SceneValidationIssue(
                    $"{path}.type",
                    "UnknownLightType",
                    $"'{light.Type}' is not a known light type. Known types: {string.Join(", ", SceneLightTypes.All)}."));
            }

            if (!double.IsFinite(light.Intensity) || light.Intensity < 0)
            {
                issues.Add(new SceneValidationIssue($"{path}.intensity", "InvalidIntensity", "Intensity must be a finite number ≥ 0."));
            }

            if (!IsHexColor(light.Color))
            {
                issues.Add(new SceneValidationIssue(
                    $"{path}.color", "InvalidColor", "Colour must be a hex string such as '#ffffff'."));
            }

            ValidateVec3(light.Position, $"{path}.position", issues);

            if (light.Target is { } target)
            {
                ValidateVec3(target, $"{path}.target", issues);
            }
        }
    }

    private static void ValidateEnvironment(SceneDocument document, List<SceneValidationIssue> issues)
    {
        if (document.Environment is not { } environment)
        {
            return;
        }

        if (environment.EnvironmentMap is { } map)
        {
            if (map.AssetType != SceneAssetTypes.EnvironmentMap)
            {
                issues.Add(new SceneValidationIssue(
                    "environment.environmentMap.assetType",
                    "InvalidEnvironmentMapRef",
                    $"The scene environment map must reference an {SceneAssetTypes.EnvironmentMap} asset."));
            }

            ValidateAssetRef(map, "environment.environmentMap", issues);
        }

        if (environment.Background is not null && !IsHexColor(environment.Background))
        {
            issues.Add(new SceneValidationIssue(
                "environment.background", "InvalidColor", "The background must be a hex colour such as '#101014'."));
        }

        if (environment.ExposureEv is { } exposure && !double.IsFinite(exposure))
        {
            issues.Add(new SceneValidationIssue("environment.exposureEv", "NonFiniteNumber", "Exposure must be a finite number."));
        }
    }

    private static void ValidateId(string? id, string path, string kind, List<SceneValidationIssue> issues)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            issues.Add(new SceneValidationIssue(path, "IdMissing", $"{kind} ids are required and cannot be blank."));
            return;
        }

        if (id.Length > MaxIdLength)
        {
            issues.Add(new SceneValidationIssue(path, "IdTooLong", $"{kind} ids may be at most {MaxIdLength} characters."));
        }

        // Ids travel through URLs, tool arguments and log lines. Restricting them to a
        // boring alphabet keeps every one of those unambiguous without escaping rules.
        foreach (var c in id)
        {
            if (!char.IsAsciiLetterOrDigit(c) && c is not ('-' or '_' or ':' or '.'))
            {
                issues.Add(new SceneValidationIssue(
                    path,
                    "IdCharactersInvalid",
                    $"{kind} ids may contain only letters, digits, '-', '_', ':' and '.' - '{c}' is not allowed."));
                return;
            }
        }
    }

    private static bool IsHexColor(string? value)
    {
        if (value is null || value.Length is not (4 or 7) || value[0] != '#')
        {
            return false;
        }

        for (var i = 1; i < value.Length; i++)
        {
            if (!char.IsAsciiHexDigit(value[i]))
            {
                return false;
            }
        }

        return true;
    }
}
