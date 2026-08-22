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

    /// <summary>
    /// Ceiling on open decisions in one scene. The same "something has gone wrong" limit the
    /// node cap is: a scene with a thousand unresolved choices is not a scene a person is
    /// going to work through, it is an agent looping.
    /// </summary>
    public const int MaxSlots = 200;

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
        ValidateSlots(document, issues);
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

        // A slot is one thing in the world with several proposals for what it should be, so
        // two nodes claiming the same slot would put two of the alternatives on stage at once
        // and leave "apply the chosen candidate" with no single node to apply it to.
        var seenSlotIds = new HashSet<string>(StringComparer.Ordinal);

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

                if (!string.IsNullOrWhiteSpace(node.SlotId) && !seenSlotIds.Add(node.SlotId))
                {
                    issues.Add(new SceneValidationIssue(
                        $"{path}.slotId",
                        "DuplicateSlotNode",
                        $"Slot '{node.SlotId}' is filled by more than one node. A slot is one place in the scene; its alternatives belong in the slot's candidates, not in extra nodes."));
                }
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

            if (node.Material is { } material)
            {
                ValidateMaterialBinding(material, $"{path}.material", requireSlot: false, issues);
            }

            if (node.MaterialSlots is { Count: > 0 } slots)
            {
                var seenSlots = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                for (var s = 0; s < slots.Count; s++)
                {
                    var slotPath = $"{path}.materialSlots[{s}]";
                    ValidateMaterialBinding(slots[s], slotPath, requireSlot: true, issues);

                    var slotName = slots[s].Slot;
                    if (!string.IsNullOrWhiteSpace(slotName) && !seenSlots.Add(slotName.Trim()))
                    {
                        issues.Add(new SceneValidationIssue(
                            $"{slotPath}.slot",
                            "DuplicateMaterialSlot",
                            $"Slot '{slotName}' is dressed twice on this node. Two bindings for one slot have no defined winner."));
                    }
                }
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

    /// <summary>
    /// The open decisions and their proposals.
    ///
    /// The rule worth naming is the last one: a slot may not claim a chosen candidate that was
    /// rejected. Those are two contradictory statements about the same proposal, and a
    /// validator that picked a winner would silently decide something only the user can.
    /// </summary>
    private static void ValidateSlots(SceneDocument document, List<SceneValidationIssue> issues)
    {
        if (document.Slots is not { Count: > 0 } slots)
        {
            return;
        }

        if (slots.Count > MaxSlots)
        {
            issues.Add(new SceneValidationIssue(
                "slots", "TooManySlots", $"A scene may hold at most {MaxSlots} slots; this document has {slots.Count}."));
        }

        var seenSlots = new HashSet<string>(StringComparer.Ordinal);
        var nodeSlots = document.Nodes is null
            ? new HashSet<string>(StringComparer.Ordinal)
            : document.Nodes
                .Where(n => !string.IsNullOrWhiteSpace(n?.SlotId))
                .Select(n => n!.SlotId!)
                .ToHashSet(StringComparer.Ordinal);

        for (var i = 0; i < slots.Count; i++)
        {
            var slot = slots[i];
            var path = $"slots[{i}]";

            if (slot is null)
            {
                issues.Add(new SceneValidationIssue(path, "SlotMissing", "A slot entry is null."));
                continue;
            }

            ValidateId(slot.Id, $"{path}.id", "Slot", issues);

            if (!string.IsNullOrEmpty(slot.Id) && !seenSlots.Add(slot.Id))
            {
                issues.Add(new SceneValidationIssue(
                    $"{path}.id",
                    "DuplicateSlotId",
                    $"Slot id '{slot.Id}' is used more than once. The id is how a user names a decision out loud, so two slots cannot share one."));
            }

            // A slot with no node decides nothing: choosing a candidate would have nowhere to
            // apply it. Reported rather than repaired, because inventing a node means inventing
            // a transform, and a scene is not the place to guess where something goes.
            if (!string.IsNullOrEmpty(slot.Id) && !nodeSlots.Contains(slot.Id))
            {
                issues.Add(new SceneValidationIssue(
                    $"{path}.id",
                    "SlotNodeMissing",
                    $"Slot '{slot.Id}' has no node carrying that slotId. Place the node first, then propose candidates for it - a choice with nowhere to land cannot be applied."));
            }

            ValidateSlotCandidates(slot, path, issues);
        }
    }

    private static void ValidateSlotCandidates(SceneSlot slot, string path, List<SceneValidationIssue> issues)
    {
        if (slot.Candidates is null)
        {
            issues.Add(new SceneValidationIssue(
                $"{path}.candidates", "SlotCandidatesMissing", "A slot's 'candidates' array is required (use [] for a slot nobody has proposed for yet)."));
            return;
        }

        if (slot.Candidates.Count > SceneSlotIds.MaxCandidates)
        {
            issues.Add(new SceneValidationIssue(
                $"{path}.candidates",
                "TooManyCandidates",
                $"A slot may hold at most {SceneSlotIds.MaxCandidates} candidates, rejected ones included; this one has {slot.Candidates.Count}."));
        }

        var seenCandidates = new HashSet<string>(StringComparer.Ordinal);

        for (var c = 0; c < slot.Candidates.Count; c++)
        {
            var candidate = slot.Candidates[c];
            var candidatePath = $"{path}.candidates[{c}]";

            if (candidate is null)
            {
                issues.Add(new SceneValidationIssue(candidatePath, "CandidateMissing", "A candidate entry is null."));
                continue;
            }

            ValidateId(candidate.Id, $"{candidatePath}.id", "Candidate", issues);

            if (!string.IsNullOrEmpty(candidate.Id) && !seenCandidates.Add(candidate.Id))
            {
                issues.Add(new SceneValidationIssue(
                    $"{candidatePath}.id",
                    "DuplicateCandidateId",
                    $"Candidate id '{candidate.Id}' appears twice in slot '{slot.Id}'. The user picks by this name, so it has to mean one proposal."));
            }

            if (candidate.Asset is null && candidate.Material is null && candidate.StoreAsset is null)
            {
                issues.Add(new SceneValidationIssue(
                    candidatePath,
                    "EmptyCandidate",
                    $"Candidate '{candidate.Id}' proposes nothing. Give it an asset, a store asset, a material, or an asset and a material - there is no other thing a slot can be filled with."));
            }

            // A candidate is one proposal, and "this library asset, or that store asset"
            // is two. Resolving them differently is the point: a library candidate is
            // chosen, a store one has to be acquired first.
            if (candidate.Asset is not null && candidate.StoreAsset is not null)
            {
                issues.Add(new SceneValidationIssue(
                    candidatePath,
                    "CandidateHasBothAssets",
                    $"Candidate '{candidate.Id}' names both a library asset and a store asset. Propose them as two candidates - they are two different answers, and only one of them can be chosen without downloading anything."));
            }

            if (candidate.Asset is { } asset)
            {
                ValidateAssetRef(asset, $"{candidatePath}.asset", issues);
            }

            if (candidate.StoreAsset is { } storeAsset)
            {
                ValidateStoreAssetRef(storeAsset, $"{candidatePath}.storeAsset", issues);
            }

            if (candidate.Material is { } material)
            {
                ValidateMaterialBinding(material, $"{candidatePath}.material", requireSlot: false, issues);
            }
        }

        if (slot.ChosenCandidateId is { } chosenId)
        {
            var chosen = slot.Candidate(chosenId);

            if (chosen is null)
            {
                issues.Add(new SceneValidationIssue(
                    $"{path}.chosenCandidateId",
                    "ChosenCandidateNotFound",
                    $"Slot '{slot.Id}' names '{chosenId}' as chosen, but no candidate has that id."));
            }
            else if (chosen.IsRejected)
            {
                issues.Add(new SceneValidationIssue(
                    $"{path}.chosenCandidateId",
                    "ChosenCandidateRejected",
                    $"Slot '{slot.Id}' has '{chosenId}' both chosen and rejected. Clear the choice or the rejection - which one stands is the user's call, not this validator's."));
            }
        }

        if (slot.ResolvedBy is { } resolvedBy)
        {
            if (!SceneSlotResolvers.IsResolver(resolvedBy))
            {
                issues.Add(new SceneValidationIssue(
                    $"{path}.resolvedBy",
                    "UnknownSlotResolver",
                    $"'{resolvedBy}' is not a slot resolver. Use one of: {string.Join(", ", SceneSlotResolvers.All)}."));
            }

            // Who decided, on a slot where nothing was decided. Left in place this is how a
            // scene ends up claiming a human approved something no human ever saw.
            if (slot.ChosenCandidateId is null)
            {
                issues.Add(new SceneValidationIssue(
                    $"{path}.resolvedBy",
                    "ResolverWithoutChoice",
                    $"Slot '{slot.Id}' records who resolved it but has no chosen candidate. Attribution without a decision claims something happened that did not."));
            }
        }
        else if (slot.ChosenCandidateId is not null)
        {
            issues.Add(new SceneValidationIssue(
                $"{path}.resolvedBy",
                "ChoiceWithoutResolver",
                $"Slot '{slot.Id}' has a chosen candidate but does not say who chose it. Whether a person or an agent made a decision is the one thing this model exists to keep."));
        }
    }

    private static void ValidateMaterialBinding(
        SceneMaterialBinding binding,
        string path,
        bool requireSlot,
        List<SceneValidationIssue> issues)
    {
        if (binding.TextureSetId is <= 0)
        {
            issues.Add(new SceneValidationIssue(
                $"{path}.textureSetId", "InvalidTextureSetId", "A texture set id must be a positive integer."));
        }

        if (binding.MaterialId is <= 0)
        {
            issues.Add(new SceneValidationIssue(
                $"{path}.materialId", "InvalidMaterialId", "A material id must be a positive integer."));
        }

        // Two surfaces asked for by name, with no rule for which wins. Rejected rather
        // than resolved, the same call the suspended/groundSnap contradiction takes.
        if (binding.TextureSetId is not null && binding.MaterialId is not null)
        {
            issues.Add(new SceneValidationIssue(
                path,
                "AmbiguousMaterialBinding",
                "A binding names both a material and a texture set. Pick one - they are two ways to supply the same surface."));
        }

        if (requireSlot && string.IsNullOrWhiteSpace(binding.Slot))
        {
            issues.Add(new SceneValidationIssue(
                $"{path}.slot",
                "MissingMaterialSlot",
                "A per-slot binding must name the slot it dresses. Use the node's default material binding to dress the whole node."));
        }

        if (binding.TextureSetId is null && binding.MaterialId is null && binding.Variant is null)
        {
            issues.Add(new SceneValidationIssue(
                path,
                "EmptyMaterialBinding",
                "A binding that names nothing has no meaning. Remove it, or give it a material or a texture set."));
        }
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

    /// <summary>
    /// A store proposal only has to be addressable: which store, and which asset there.
    /// Everything else on it - the title, the picture, the price - is a copy of what the
    /// store said, kept so the card can be drawn with the store down, and none of it is
    /// worth failing a scene over if it is missing.
    /// </summary>
    private static void ValidateStoreAssetRef(SceneStoreAssetRef store, string path, List<SceneValidationIssue> issues)
    {
        if (string.IsNullOrWhiteSpace(store.StoreUrl))
        {
            issues.Add(new SceneValidationIssue(
                $"{path}.storeUrl",
                "StoreUrlRequired",
                "A store candidate must say which store it came from - two stores can hold the same id."));
        }
        else if (!store.StoreUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            issues.Add(new SceneValidationIssue(
                $"{path}.storeUrl",
                "InsecureStoreUrl",
                $"'{store.StoreUrl}' is not an https URL. The importer refuses anything else, so a candidate naming one could never be acquired."));
        }

        if (string.IsNullOrWhiteSpace(store.StoreAssetId))
        {
            issues.Add(new SceneValidationIssue(
                $"{path}.storeAssetId", "StoreAssetIdRequired", "A store candidate must name a store asset id."));
        }

        if (store.Price is < 0)
        {
            issues.Add(new SceneValidationIssue(
                $"{path}.price", "InvalidStorePrice", "A price cannot be negative."));
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
