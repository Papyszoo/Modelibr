using Application.Abstractions.Messaging;
using Domain.Scenes;
using SharedKernel;

namespace Application.Scenes;

/// <summary>
/// What the three slot writes share: finding the slot, finding the node it decides, and
/// turning the result into a view with the candidates' facts folded in.
/// </summary>
internal abstract class SceneSlotHandlerBase
{
    protected SceneSlotHandlerBase(
        ISceneWriter writer,
        ISceneAssetFacts facts,
        ISceneAssetProfiles profiles,
        ISceneCandidateMedia media,
        ISceneProjectConstraints constraints)
    {
        Writer = writer;
        SceneFacts = facts;
        Profiles = profiles;
        Media = media;
        Constraints = constraints;
    }

    protected ISceneWriter Writer { get; }

    protected ISceneAssetFacts SceneFacts { get; }

    protected ISceneAssetProfiles Profiles { get; }

    protected ISceneCandidateMedia Media { get; }

    protected ISceneProjectConstraints Constraints { get; }

    internal static int IndexOfSlot(SceneDocument document, string slotId)
    {
        var slots = document.Slots;
        if (slots is null)
        {
            return -1;
        }

        for (var i = 0; i < slots.Count; i++)
        {
            if (string.Equals(slots[i].Id, slotId, StringComparison.Ordinal))
            {
                return i;
            }
        }

        return -1;
    }

    internal static int IndexOfSlotNode(SceneDocument document, string slotId)
    {
        for (var i = 0; i < document.Nodes.Count; i++)
        {
            if (string.Equals(document.Nodes[i].SlotId, slotId, StringComparison.Ordinal))
            {
                return i;
            }
        }

        return -1;
    }

    internal static Error SlotNotFound(int sceneId, string slotId) => new(
        "Scene.SlotNotFound",
        $"Scene {sceneId} has no slot '{slotId}'. Open one with propose_candidates, and list the ones it has with get_slots.");

    /// <summary>
    /// The slot as the caller now sees it, with each candidate's dimensions, part make-up and
    /// quality flags resolved. Only the candidates' assets are looked up here - the nodes'
    /// facts were already resolved by the write.
    /// </summary>
    protected async Task<SceneSlotView> ProjectAsync(
        SceneDocument document,
        string slotId,
        int sceneId,
        CancellationToken cancellationToken)
    {
        var index = IndexOfSlot(document, slotId);
        var slot = index >= 0 ? document.Slots![index] : new SceneSlot(slotId, Array.Empty<SceneSlotCandidate>());

        var assets = slot.Candidates.Where(c => c.Asset is not null).Select(c => c.Asset!).ToList();
        var facts = await SceneFacts.ResolveAsync(assets, cancellationToken);
        var profiles = await Profiles.ResolveAsync(assets, cancellationToken);
        var media = await Media.ResolveAsync(document, cancellationToken);
        // What the scene's project asks of each proposal, so a card can state what its
        // numbers are being measured against (prompt 13-D5). Null when the scene is unlinked.
        var project = await Constraints.ForSceneAsync(sceneId, cancellationToken);

        return SceneSlotViewBuilder.Describe(slot, document, facts, profiles, media, project);
    }

    /// <summary>
    /// Several slots at once, resolved in one pass rather than one <see cref="ProjectAsync"/>
    /// call each - a bulk write that answered with N sequential lookups would give back the
    /// cost it just saved.
    /// </summary>
    protected async Task<IReadOnlyList<SceneSlotView>> ProjectAllAsync(
        SceneDocument document,
        int sceneId,
        IEnumerable<string> slotIds,
        CancellationToken cancellationToken)
    {
        var wanted = slotIds.ToHashSet(StringComparer.Ordinal);
        var slots = (document.Slots ?? Array.Empty<SceneSlot>())
            .Where(slot => wanted.Contains(slot.Id))
            .ToList();

        var assets = slots
            .SelectMany(slot => slot.Candidates)
            .Where(c => c.Asset is not null)
            .Select(c => c.Asset!)
            .ToList();

        var facts = await SceneFacts.ResolveAsync(assets, cancellationToken);
        var profiles = await Profiles.ResolveAsync(assets, cancellationToken);
        var media = await Media.ResolveAsync(document, cancellationToken);
        var project = await Constraints.ForSceneAsync(sceneId, cancellationToken);

        return slots
            .Select(slot => SceneSlotViewBuilder.Describe(slot, document, facts, profiles, media, project))
            .ToList();
    }
}

internal sealed class ProposeSceneCandidatesCommandHandler
    : SceneSlotHandlerBase, ICommandHandler<ProposeSceneCandidatesCommand, SceneSlotWriteResponse>
{
    public ProposeSceneCandidatesCommandHandler(
        ISceneWriter writer, ISceneAssetFacts facts, ISceneAssetProfiles profiles, ISceneCandidateMedia media,
        ISceneProjectConstraints constraints)
        : base(writer, facts, profiles, media, constraints)
    {
    }

    public async Task<Result<SceneSlotWriteResponse>> Handle(
        ProposeSceneCandidatesCommand command,
        CancellationToken cancellationToken)
    {
        if (command.Candidates is not { Count: > 0 })
        {
            return Result.Failure<SceneSlotWriteResponse>(new Error(
                "Scene.NoCandidates",
                "Propose at least one candidate. An empty round leaves the user with nothing to pick from and the slot exactly as it was."));
        }

        var built = BuildCandidates(command.Candidates);
        if (built.IsFailure)
        {
            return Result.Failure<SceneSlotWriteResponse>(built.Error);
        }

        // Proposals are verified here, at the point they are made, and not by the writer.
        // A candidate is a suggestion rather than a placement, so it is not in the document's
        // referenced assets - which is deliberate: an asset recycled after being proposed must
        // not block every later edit to the scene, including the one that rejects it. But an
        // agent proposing an id that names nothing would otherwise be told nothing until the
        // user picked it and got an empty node.
        var proposed = built.Value.Where(c => c.Asset is not null).Select(c => c.Asset!).ToList();
        if (proposed.Count > 0)
        {
            var problems = await SceneFacts.FindUnresolvableAsync(proposed, cancellationToken);
            if (problems.Count > 0)
            {
                return Result.Failure<SceneSlotWriteResponse>(new Error(
                    "Scene.AssetNotFound",
                    string.Join(" ", problems.Select(p => p.Reason))));
            }
        }

        SceneSlotSnapshot? previous = null;

        var result = await Writer.ApplyAsync(
            command.SceneId,
            command.ExpectedRevision,
            document =>
            {
                var nodeIndex = IndexOfSlotNode(document, command.SlotId);
                if (nodeIndex < 0)
                {
                    return Result.Failure<SceneDocument>(new Error(
                        "Scene.SlotNodeNotFound",
                        $"No node in scene {command.SceneId} carries slotId '{command.SlotId}'. " +
                        "Place the node first - place_asset takes a slotId - then propose what else it could be. " +
                        "A slot names one place in the scene, so the alternatives have somewhere to go."));
                }

                var node = document.Nodes[nodeIndex];
                var slots = document.Slots?.ToList() ?? new List<SceneSlot>();
                var index = IndexOfSlot(document, command.SlotId);
                var existing = index >= 0 ? slots[index] : null;

                previous = new SceneSlotSnapshot(existing);

                var candidates = existing?.Candidates.ToList() ?? new List<SceneSlotCandidate>();

                // Opening a slot over something already placed: that asset becomes the first
                // candidate rather than an unlisted default. The whole model says an agent's
                // pick is a proposal, and a slot whose visible occupant was not one of the
                // options is the silent decision this feature exists to remove.
                var capture = existing is null && node.Asset is not null;
                var wanted = built.Value.Count + (capture ? 1 : 0);
                var ids = SceneSlotIds.Allocate(existing, wanted);
                var next = 0;

                if (capture)
                {
                    candidates.Add(new SceneSlotCandidate(
                        ids[next++],
                        node.Asset,
                        node.Material,
                        "Already standing here when the slot was opened.",
                        node.Name));
                }

                foreach (var candidate in built.Value)
                {
                    candidates.Add(candidate with { Id = ids[next++] });
                }

                var slot = (existing ?? new SceneSlot(command.SlotId, Array.Empty<SceneSlotCandidate>())) with
                {
                    Candidates = candidates,
                    // A brief is only replaced when a new one is given: a second round that
                    // does not restate the brief is still looking for the same thing.
                    Brief = command.Brief ?? existing?.Brief,
                };

                if (index >= 0)
                {
                    slots[index] = slot;
                }
                else
                {
                    slots.Add(slot);
                }

                return Result.Success(document with { Slots = slots });
            },
            cancellationToken);

        return result.IsFailure
            ? Result.Failure<SceneSlotWriteResponse>(result.Error)
            : Result.Success(new SceneSlotWriteResponse(
                result.Value.View.Scene,
                await ProjectAsync(result.Value.Document, command.SlotId, command.SceneId, cancellationToken),
                previous ?? new SceneSlotSnapshot(null)));
    }

    /// <summary>
    /// Turns the caller's proposals into candidates, with placeholder ids the mutation
    /// replaces. Shape problems are caught here so a bad round is rejected before it touches
    /// the scene's revision.
    /// </summary>
    private static Result<IReadOnlyList<SceneSlotCandidate>> BuildCandidates(
        IReadOnlyList<SceneCandidateProposal> proposals)
    {
        var candidates = new List<SceneSlotCandidate>(proposals.Count);

        for (var i = 0; i < proposals.Count; i++)
        {
            var proposal = proposals[i];

            var hasAsset = proposal.AssetType is not null || proposal.AssetId is not null;
            var hasMaterial = proposal.TextureSetId is not null || proposal.MaterialId is not null || proposal.Variant is not null;
            var hasStore = proposal.StoreUrl is not null || proposal.StoreAssetId is not null;

            if (!hasAsset && !hasMaterial && !hasStore)
            {
                return Result.Failure<IReadOnlyList<SceneSlotCandidate>>(new Error(
                    "Scene.CandidateEmpty",
                    $"Candidate {i + 1} proposes nothing. Give it an asset (assetType + assetId, and versionId for a Model), a store asset (storeUrl + storeAssetId), a material, or an asset and a material."));
            }

            if (hasAsset && (proposal.AssetType is null || proposal.AssetId is null))
            {
                return Result.Failure<IReadOnlyList<SceneSlotCandidate>>(new Error(
                    "Scene.CandidateIncomplete",
                    $"Candidate {i + 1} names half an asset reference. Both assetType and assetId are needed."));
            }

            if (hasStore && (proposal.StoreUrl is null || proposal.StoreAssetId is null))
            {
                return Result.Failure<IReadOnlyList<SceneSlotCandidate>>(new Error(
                    "Scene.CandidateIncomplete",
                    $"Candidate {i + 1} names half a store reference. Both storeUrl and storeAssetId are needed - an id without a store is not addressable."));
            }

            // One proposal is one answer. "This one from the library, or that one from the
            // store" is two answers with two different costs, and they are settled
            // differently: one is chosen, the other has to be acquired first.
            if (hasAsset && hasStore)
            {
                return Result.Failure<IReadOnlyList<SceneSlotCandidate>>(new Error(
                    "Scene.CandidateHasBothAssets",
                    $"Candidate {i + 1} names both a library asset and a store asset. Propose them separately."));
            }

            candidates.Add(new SceneSlotCandidate(
                // Replaced during the mutation, where the slot's already-used ids are visible.
                "?",
                hasAsset ? new SceneAssetRef(proposal.AssetType!, proposal.AssetId!.Value, proposal.VersionId) : null,
                hasMaterial ? new SceneMaterialBinding(proposal.TextureSetId, proposal.Variant, proposal.MaterialId) : null,
                proposal.Rationale,
                proposal.Label,
                RejectedReason: null,
                // The title and picture are copied into the scene on purpose: the card has to
                // draw with the store unreachable, and a proposal nobody can read is a
                // proposal nobody can judge.
                StoreAsset: hasStore
                    ? new SceneStoreAssetRef(
                        proposal.StoreUrl!.Trim().TrimEnd('/'),
                        proposal.StoreAssetId!.Trim(),
                        proposal.StoreTitle,
                        proposal.StoreThumbnailUrl,
                        proposal.StorePrice,
                        proposal.StoreCurrency)
                    : null));
        }

        return Result.Success<IReadOnlyList<SceneSlotCandidate>>(candidates);
    }
}

internal sealed class ResolveSceneSlotCommandHandler
    : SceneSlotHandlerBase, ICommandHandler<ResolveSceneSlotCommand, SceneSlotWriteResponse>
{
    public ResolveSceneSlotCommandHandler(
        ISceneWriter writer, ISceneAssetFacts facts, ISceneAssetProfiles profiles, ISceneCandidateMedia media,
        ISceneProjectConstraints constraints)
        : base(writer, facts, profiles, media, constraints)
    {
    }

    public async Task<Result<SceneSlotWriteResponse>> Handle(
        ResolveSceneSlotCommand command,
        CancellationToken cancellationToken)
    {
        if (!command.Clear && !SceneSlotResolvers.IsResolver(command.ResolvedBy))
        {
            return Result.Failure<SceneSlotWriteResponse>(new Error(
                "Scene.UnknownSlotResolver",
                $"'{command.ResolvedBy}' is not a slot resolver. Use one of: {string.Join(", ", SceneSlotResolvers.All)}."));
        }

        if (!command.Clear && string.IsNullOrWhiteSpace(command.CandidateId))
        {
            return Result.Failure<SceneSlotWriteResponse>(new Error(
                "Scene.CandidateRequired",
                "Name the candidate to choose, or pass clear=true to reopen the slot."));
        }

        SceneSlotSnapshot? previous = null;

        var result = await Writer.ApplyAsync(
            command.SceneId,
            command.ExpectedRevision,
            document =>
            {
                var index = IndexOfSlot(document, command.SlotId);
                if (index < 0)
                {
                    return Result.Failure<SceneDocument>(SlotNotFound(command.SceneId, command.SlotId));
                }

                var slots = document.Slots!.ToList();
                var slot = slots[index];
                var nodeIndex = IndexOfSlotNode(document, command.SlotId);
                var node = nodeIndex >= 0 ? document.Nodes[nodeIndex] : null;

                previous = new SceneSlotSnapshot(
                    slot,
                    node is null ? null : new SceneSlotNodeState(node.Id, node.Asset, node.Material));

                if (command.Clear)
                {
                    // The node keeps wearing what it wears. Stripping it would empty a place in
                    // the scene to make a bookkeeping change, and reopening a question is not
                    // the same as withdrawing the answer everyone can currently see.
                    slots[index] = slot with { ChosenCandidateId = null, ResolvedBy = null };
                    return Result.Success(document with { Slots = slots });
                }

                var candidate = slot.Candidate(command.CandidateId);
                if (candidate is null)
                {
                    return Result.Failure<SceneDocument>(new Error(
                        "Scene.CandidateNotFound",
                        $"Slot '{command.SlotId}' has no candidate '{command.CandidateId}'. It offers: " +
                        $"{(slot.Candidates.Count == 0 ? "nothing yet" : string.Join(", ", slot.Candidates.Select(c => c.Id)))}."));
                }

                // The agent proposes and the user decides, and for a store candidate the
                // deciding includes paying for it or at least downloading it. resolve_slot
                // writes a node's asset from a candidate; a store candidate has no local
                // asset to write, so this is a wall rather than a policy: import it first,
                // propose the imported asset, and the slot resolves normally.
                if (candidate.IsFromStore)
                {
                    return Result.Failure<SceneDocument>(new Error(
                        "Scene.CandidateNotInLibrary",
                        $"Candidate '{SceneSlotViewBuilder.Ref(command.SlotId, candidate.Id)}' is a store asset, not a library one, so it cannot be chosen as it stands. " +
                        "Import it first - a free asset with import_store_asset, a paid one by the user accepting it in the app - then propose the imported asset for this slot."));
                }

                if (candidate.IsRejected)
                {
                    return Result.Failure<SceneDocument>(new Error(
                        "Scene.CandidateRejected",
                        $"Candidate '{SceneSlotViewBuilder.Ref(command.SlotId, candidate.Id)}' was ruled out: {candidate.RejectedReason} " +
                        "A rejection is kept so it is not proposed again by accident; propose it afresh if it should be back on the table."));
                }

                if (node is null)
                {
                    return Result.Failure<SceneDocument>(new Error(
                        "Scene.SlotNodeNotFound",
                        $"No node in scene {command.SceneId} carries slotId '{command.SlotId}', so there is nowhere to apply the choice."));
                }

                var nodes = document.Nodes.ToArray();

                // The candidate is the whole answer for this slot: what it names replaces what
                // the node wore, and what it does not name is left alone. So an asset-only
                // proposal drops the previous option's dressing rather than carrying it onto a
                // different object, and a material-only slot changes the surface and not the thing.
                nodes[nodeIndex] = node with
                {
                    Asset = candidate.Asset ?? node.Asset,
                    Material = candidate.Asset is not null || candidate.Material is not null
                        ? candidate.Material
                        : node.Material,
                };

                slots[index] = slot with
                {
                    ChosenCandidateId = candidate.Id,
                    ResolvedBy = command.ResolvedBy,
                };

                return Result.Success(document with { Nodes = nodes, Slots = slots });
            },
            cancellationToken);

        return result.IsFailure
            ? Result.Failure<SceneSlotWriteResponse>(result.Error)
            : Result.Success(new SceneSlotWriteResponse(
                result.Value.View.Scene,
                await ProjectAsync(result.Value.Document, command.SlotId, command.SceneId, cancellationToken),
                previous ?? new SceneSlotSnapshot(null)));
    }
}

internal sealed class RejectSceneCandidatesCommandHandler
    : SceneSlotHandlerBase, ICommandHandler<RejectSceneCandidatesCommand, SceneSlotWriteResponse>
{
    public RejectSceneCandidatesCommandHandler(
        ISceneWriter writer, ISceneAssetFacts facts, ISceneAssetProfiles profiles, ISceneCandidateMedia media,
        ISceneProjectConstraints constraints)
        : base(writer, facts, profiles, media, constraints)
    {
    }

    public async Task<Result<SceneSlotWriteResponse>> Handle(
        RejectSceneCandidatesCommand command,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(command.Reason))
        {
            return Result.Failure<SceneSlotWriteResponse>(new Error(
                "Scene.RejectionReasonRequired",
                "Say why. The reason is the only thing that turns a rejection into a better next proposal instead of the same one again."));
        }

        if (!command.All && command.CandidateIds is not { Count: > 0 })
        {
            return Result.Failure<SceneSlotWriteResponse>(new Error(
                "Scene.NoCandidates",
                "Name the candidates to reject, or pass all=true for 'none of these'."));
        }

        var reason = command.Reason.Trim();
        SceneSlotSnapshot? previous = null;

        var result = await Writer.ApplyAsync(
            command.SceneId,
            command.ExpectedRevision,
            document =>
            {
                var index = IndexOfSlot(document, command.SlotId);
                if (index < 0)
                {
                    return Result.Failure<SceneDocument>(SlotNotFound(command.SceneId, command.SlotId));
                }

                var slots = document.Slots!.ToList();
                var slot = slots[index];
                previous = new SceneSlotSnapshot(slot);

                var targets = command.All
                    ? slot.Open.Select(c => c.Id).ToList()
                    : command.CandidateIds!.ToList();

                var unknown = targets
                    .Where(id => slot.Candidate(id) is null)
                    .ToList();

                if (unknown.Count > 0)
                {
                    return Result.Failure<SceneDocument>(new Error(
                        "Scene.CandidateNotFound",
                        $"Slot '{command.SlotId}' has no candidate {string.Join(", ", unknown.Select(id => $"'{id}'"))}. " +
                        $"It offers: {(slot.Candidates.Count == 0 ? "nothing yet" : string.Join(", ", slot.Candidates.Select(c => c.Id)))}."));
                }

                var rejected = targets.ToHashSet(StringComparer.Ordinal);

                // An already-rejected candidate keeps its original reason. The first "no" is
                // the one that says something, and overwriting it with a later blanket
                // "none of these" would erase the specific feedback the agent needs.
                var candidates = slot.Candidates
                    .Select(c => rejected.Contains(c.Id) && !c.IsRejected ? c with { RejectedReason = reason } : c)
                    .ToList();

                var chosenGone = slot.ChosenCandidateId is { } chosen && rejected.Contains(chosen);

                slots[index] = slot with
                {
                    Candidates = candidates,
                    ChosenCandidateId = chosenGone ? null : slot.ChosenCandidateId,
                    ResolvedBy = chosenGone ? null : slot.ResolvedBy,
                    // Only a blanket rejection is a statement about the round as a whole.
                    // Ruling out one card says nothing about the ones still standing.
                    ReopenedReason = command.All ? reason : slot.ReopenedReason,
                };

                return Result.Success(document with { Slots = slots });
            },
            cancellationToken);

        return result.IsFailure
            ? Result.Failure<SceneSlotWriteResponse>(result.Error)
            : Result.Success(new SceneSlotWriteResponse(
                result.Value.View.Scene,
                await ProjectAsync(result.Value.Document, command.SlotId, command.SceneId, cancellationToken),
                previous ?? new SceneSlotSnapshot(null)));
    }
}

internal sealed class RestoreSceneSlotCommandHandler : ICommandHandler<RestoreSceneSlotCommand, SceneSummary>
{
    private readonly ISceneWriter _writer;

    public RestoreSceneSlotCommandHandler(ISceneWriter writer)
    {
        _writer = writer;
    }

    public async Task<Result<SceneSummary>> Handle(
        RestoreSceneSlotCommand command,
        CancellationToken cancellationToken)
    {
        var result = await _writer.ApplyAsync(
            command.SceneId,
            null,
            document =>
            {
                var slots = document.Slots?.ToList() ?? new List<SceneSlot>();
                var index = SceneSlotHandlerBase.IndexOfSlot(document, command.SlotId);

                if (command.Slot is null)
                {
                    // The slot did not exist before the write being undone, so putting things
                    // back means removing it - not leaving an empty one behind.
                    if (index >= 0)
                    {
                        slots.RemoveAt(index);
                    }
                }
                else if (index >= 0)
                {
                    slots[index] = command.Slot;
                }
                else
                {
                    slots.Add(command.Slot);
                }

                var nodes = document.Nodes;

                if (command.Node is { } state)
                {
                    var nodeIndex = MoveSceneNodeCommandHandler.IndexOfNode(document, state.NodeId);
                    if (nodeIndex >= 0)
                    {
                        var updated = document.Nodes.ToArray();
                        // Exact, like every other undo in this codebase: a node that wore no
                        // material is only restorable while null means null.
                        updated[nodeIndex] = updated[nodeIndex] with { Asset = state.Asset, Material = state.Material };
                        nodes = updated;
                    }
                }

                return Result.Success(document with { Nodes = nodes, Slots = slots.Count == 0 ? null : slots });
            },
            cancellationToken,
            // Restoring state that was legal when it was recorded. An asset recycled since
            // then must not turn a reversible write into an irreversible one.
            verifyNewReferences: false);

        return result.IsFailure
            ? Result.Failure<SceneSummary>(result.Error)
            : Result.Success(result.Value.View.Scene);
    }
}

internal sealed class GetSceneSlotsQueryHandler : IQueryHandler<GetSceneSlotsQuery, SceneSlotsView>
{
    private readonly ISceneWriter _writer;
    private readonly ISceneAssetFacts _facts;
    private readonly ISceneAssetProfiles _profiles;
    private readonly ISceneCandidateMedia _media;
    private readonly ISceneProjectConstraints _constraints;

    public GetSceneSlotsQueryHandler(
        ISceneWriter writer,
        ISceneAssetFacts facts,
        ISceneAssetProfiles profiles,
        ISceneCandidateMedia media,
        ISceneProjectConstraints constraints)
    {
        _writer = writer;
        _facts = facts;
        _profiles = profiles;
        _media = media;
        _constraints = constraints;
    }

    public async Task<Result<SceneSlotsView>> Handle(GetSceneSlotsQuery query, CancellationToken cancellationToken)
    {
        var loaded = await _writer.LoadAsync(query.SceneId, cancellationToken);
        if (loaded.IsFailure)
        {
            return Result.Failure<SceneSlotsView>(loaded.Error);
        }

        var (scene, document) = loaded.Value;
        var assets = SceneSlotViewBuilder.CandidateAssets(document);

        var facts = await _facts.ResolveAsync(assets, cancellationToken);
        var profiles = await _profiles.ResolveAsync(assets, cancellationToken);
        var media = await _media.ResolveAsync(document, cancellationToken);
        var project = await _constraints.ForSceneAsync(query.SceneId, cancellationToken);

        return Result.Success(new SceneSlotsView(
            SceneViewBuilder.Summarize(scene, document),
            SceneSlotViewBuilder.DescribeAll(document, facts, profiles, media, project),
            document.RecommendationSummary));
    }
}
