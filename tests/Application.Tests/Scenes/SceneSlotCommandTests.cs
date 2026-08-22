using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Scenes;
using Domain.Models;
using Domain.Scenes;
using Domain.Services;
using Moq;
using SharedKernel;
using Xunit;

namespace Application.Tests.Scenes;

/// <summary>
/// The choice loop, driven through the real <see cref="SceneWriter"/>: propose, reject,
/// propose again, choose.
///
/// What is worth asserting here is not that the fields are written - it is the behaviour the
/// requirement is actually made of. Ids survive a rejection, a rejected card cannot be
/// chosen, a blanket "none of these" reopens the slot with the user's reason attached, and
/// every write hands back an inverse complete enough to undo it.
/// </summary>
public class SceneSlotCommandTests
{
    private static readonly DateTime Now = new(2026, 8, 18, 12, 0, 0, DateTimeKind.Utc);

    private const int SceneId = 1;
    private const int LampId = 42;
    private const int OtherLampId = 43;
    private const int VersionId = 7;
    private const string Slot = "streetlight";

    private readonly Mock<ISceneRepository> _scenes = new();
    private readonly Mock<ISceneAssetFacts> _facts = new();
    private readonly Mock<ISceneAssetProfiles> _profiles = new();
    private readonly Mock<ISceneCandidateMedia> _media = new();
    private readonly Mock<ISceneDocumentCommit> _commit = new();
    private readonly SceneWriter _writer;
    private Scene _scene = null!;

    public SceneSlotCommandTests()
    {
        var clock = new Mock<IDateTimeProvider>();
        clock.SetupGet(c => c.UtcNow).Returns(Now);

        _facts.Setup(f => f.ResolveAsync(It.IsAny<IEnumerable<SceneAssetRef>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((IEnumerable<SceneAssetRef> assets, CancellationToken _) => assets
                .DistinctBy(SceneSpatial.FactsKey)
                .ToDictionary(
                    SceneSpatial.FactsKey,
                    a => new SceneAssetFacts(a.AssetType, a.AssetId, a.VersionId, new Vec3(0.4, 4, 0.4), "bottom-center"),
                    StringComparer.Ordinal));

        _facts.Setup(f => f.FindUnresolvableAsync(It.IsAny<IEnumerable<SceneAssetRef>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<SceneAssetReferenceProblem>());

        _profiles.Setup(p => p.ResolveAsync(It.IsAny<IEnumerable<SceneAssetRef>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((IEnumerable<SceneAssetRef> assets, CancellationToken _) => assets
                .DistinctBy(SceneSpatial.FactsKey)
                .ToDictionary(
                    SceneSpatial.FactsKey,
                    a => new SceneAssetProfile(a.AssetType, a.AssetId, a.VersionId, $"lamp-{a.AssetId}", PartCount: 3),
                    StringComparer.Ordinal));

        _commit.Setup(c => c.SaveAsync(It.IsAny<CancellationToken>())).ReturnsAsync(Result.Success());

        _writer = new SceneWriter(_scenes.Object, _facts.Object, _commit.Object, clock.Object);

        GivenScene(new SceneDocument(
            SceneDocument.CurrentSchemaVersion,
            new[]
            {
                new SceneNode(
                    "lamp-1",
                    SceneTransform.Identity,
                    Asset: new SceneAssetRef(SceneAssetTypes.Model, LampId, VersionId),
                    Name: "street lamp, north corner",
                    SlotId: Slot),
            },
            Array.Empty<SceneLight>(),
            SceneEnvironment.Default));
    }

    private void GivenScene(SceneDocument document)
    {
        _scene = Scene.Create(
            "Street", SceneDocumentCodec.Serialize(document), SceneDocument.CurrentSchemaVersion, Now).Value;
        typeof(Scene).GetProperty(nameof(Scene.Id))!.SetValue(_scene, SceneId);
        _scenes.Setup(s => s.GetByIdAsync(SceneId, It.IsAny<CancellationToken>())).ReturnsAsync(_scene);
    }

    private ProposeSceneCandidatesCommandHandler Propose => new(_writer, _facts.Object, _profiles.Object, _media.Object);

    private ResolveSceneSlotCommandHandler Resolve => new(_writer, _facts.Object, _profiles.Object, _media.Object);

    private RejectSceneCandidatesCommandHandler Reject => new(_writer, _facts.Object, _profiles.Object, _media.Object);

    private RestoreSceneSlotCommandHandler Restore => new(_writer);

    private GetSceneSlotsQueryHandler Slots => new(_writer, _facts.Object, _profiles.Object, _media.Object);

    private RemoveSceneNodeCommandHandler Remove => new(_writer);

    private RestoreSceneNodeCommandHandler RestoreNode => new(_writer);

    private static SceneCandidateProposal Proposal(int assetId, string rationale = "fits the brief") =>
        new(SceneAssetTypes.Model, assetId, VersionId, rationale);

    private async Task<SceneSlotView> ProposeTwo(string? brief = "low-poly, reads as rundown")
    {
        var result = await Propose.Handle(
            new ProposeSceneCandidatesCommand(
                SceneId, Slot, new[] { Proposal(OtherLampId), Proposal(44) }, brief),
            CancellationToken.None);

        Assert.True(result.IsSuccess, result.IsFailure ? result.Error.Message : null);
        return result.Value.Slot;
    }

    [Fact]
    public async Task Opening_A_Slot_Makes_The_Asset_Already_Standing_There_The_First_Candidate()
    {
        // The point of the whole model: nothing in the scene is an unlisted default. The lamp
        // the agent placed is candidate A, sitting in the list beside the alternatives.
        var slot = await ProposeTwo();

        Assert.Equal(new[] { "A", "B", "C" }, slot.Candidates.Select(c => c.Id));
        Assert.Equal(LampId, slot.Candidates[0].Asset!.AssetId);
        Assert.Equal("lamp-1", slot.NodeId);
        Assert.Equal(SceneSlotStatuses.Proposed, slot.Status);
        Assert.Null(slot.ChosenCandidateId);
    }

    [Fact]
    public async Task A_Candidate_Card_Carries_The_Numbers_As_Well_As_The_Argument()
    {
        // A rationale on its own is a plausible sentence about an asset nobody measured, and
        // it is exactly what a user cannot overrule.
        var slot = await ProposeTwo();
        var candidate = slot.Candidates.Single(c => c.Id == "B");

        Assert.Equal("streetlight/B", candidate.Ref);
        Assert.Equal("fits the brief", candidate.Rationale);
        Assert.Equal(4, candidate.Facts!.Dimensions!.Value.Y, 6);
        Assert.Equal(3, candidate.Facts.PartCount);
        Assert.Equal("lamp-43", candidate.Facts.Name);
    }

    [Fact]
    public async Task A_Store_Candidate_Is_Proposable_But_Not_Choosable()
    {
        // The inversion part B exists for: the agent may put something the library does not
        // have on the table, and may not settle the slot with it. Acquiring is the user's.
        var proposed = await Propose.Handle(
            new ProposeSceneCandidatesCommand(
                SceneId,
                Slot,
                new[]
                {
                    new SceneCandidateProposal(
                        Rationale: "nothing in the library is low-poly",
                        StoreUrl: "https://store.modelibr.com",
                        StoreAssetId: "47f60614-522f-4ced-941c-318ac5c7bd34",
                        StoreTitle: "Quaternius: Ultimate Furniture Pack",
                        StorePrice: 0m,
                        StoreCurrency: "USD")
                }),
            CancellationToken.None);

        Assert.True(proposed.IsSuccess, proposed.IsFailure ? proposed.Error.Message : null);
        var candidate = proposed.Value.Slot.Candidates.Single(c => c.StoreAsset is not null);
        Assert.Equal("47f60614-522f-4ced-941c-318ac5c7bd34", candidate.StoreAsset!.StoreAssetId);
        Assert.Null(candidate.Asset);
        Assert.False(candidate.Choosable);

        var resolved = await Resolve.Handle(
            new ResolveSceneSlotCommand(SceneId, Slot, candidate.Id, SceneSlotResolvers.User),
            CancellationToken.None);

        Assert.True(resolved.IsFailure);
        Assert.Equal("Scene.CandidateNotInLibrary", resolved.Error.Code);
        Assert.Contains("import_store_asset", resolved.Error.Message);
    }

    [Fact]
    public async Task A_Candidate_Naming_Both_A_Library_And_A_Store_Asset_Is_Refused()
    {
        var result = await Propose.Handle(
            new ProposeSceneCandidatesCommand(
                SceneId,
                Slot,
                new[]
                {
                    new SceneCandidateProposal(
                        SceneAssetTypes.Model, OtherLampId, VersionId,
                        StoreUrl: "https://store.modelibr.com",
                        StoreAssetId: "abc")
                }),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.CandidateHasBothAssets", result.Error.Code);
    }

    [Fact]
    public async Task Proposing_Into_A_Slot_That_Has_No_Node_Is_Refused_With_What_To_Do()
    {
        var result = await Propose.Handle(
            new ProposeSceneCandidatesCommand(SceneId, "hero-building", new[] { Proposal(OtherLampId) }),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.SlotNodeNotFound", result.Error.Code);
        Assert.Contains("place_asset", result.Error.Message);
    }

    [Fact]
    public async Task Proposing_An_Asset_That_Does_Not_Exist_Is_Refused_Where_It_Is_Proposed()
    {
        // Not at the point the user picks it and gets an empty node. The writer does not
        // verify candidates on purpose, so this check has to live here.
        _facts.Setup(f => f.FindUnresolvableAsync(It.IsAny<IEnumerable<SceneAssetRef>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[]
            {
                new SceneAssetReferenceProblem(new SceneAssetRef(SceneAssetTypes.Model, 999, VersionId), "Model 999 does not exist."),
            });

        var result = await Propose.Handle(
            new ProposeSceneCandidatesCommand(SceneId, Slot, new[] { Proposal(999) }),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.AssetNotFound", result.Error.Code);
    }

    [Fact]
    public async Task Rejecting_Keeps_The_Card_With_Its_Reason_And_Never_Renumbers_The_Rest()
    {
        await ProposeTwo();

        var rejected = await Reject.Handle(
            new RejectSceneCandidatesCommand(SceneId, Slot, new[] { "B" }, "too modern"),
            CancellationToken.None);

        Assert.True(rejected.IsSuccess);
        var b = rejected.Value.Slot.Candidates.Single(c => c.Id == "B");
        Assert.True(b.Rejected);
        Assert.Equal("too modern", b.RejectedReason);

        // The next round starts at D. A rejected B stays B, so "I don't like B" means one
        // asset for the life of the scene.
        var again = await Propose.Handle(
            new ProposeSceneCandidatesCommand(SceneId, Slot, new[] { Proposal(45) }),
            CancellationToken.None);

        Assert.Equal(new[] { "A", "B", "C", "D" }, again.Value.Slot.Candidates.Select(c => c.Id));
    }

    [Fact]
    public async Task None_Of_These_Rejects_Everything_Standing_And_Reopens_The_Slot_With_The_Reason()
    {
        await ProposeTwo();

        var result = await Reject.Handle(
            new RejectSceneCandidatesCommand(SceneId, Slot, null, "all too modern", All: true),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.All(result.Value.Slot.Candidates, c => Assert.True(c.Rejected));
        Assert.Equal(SceneSlotStatuses.Rejected, result.Value.Slot.Status);
        Assert.Equal("all too modern", result.Value.Slot.ReopenedReason);
    }

    [Fact]
    public async Task A_Blanket_Rejection_Does_Not_Overwrite_A_Reason_Already_Given()
    {
        // The first "no" is the one that says something. A later "none of these" must not
        // flatten "too modern" into itself - that specific note is what the next round reads.
        await ProposeTwo();
        await Reject.Handle(
            new RejectSceneCandidatesCommand(SceneId, Slot, new[] { "B" }, "too modern"),
            CancellationToken.None);

        var result = await Reject.Handle(
            new RejectSceneCandidatesCommand(SceneId, Slot, null, "none of these", All: true),
            CancellationToken.None);

        Assert.Equal("too modern", result.Value.Slot.Candidates.Single(c => c.Id == "B").RejectedReason);
        Assert.Equal("none of these", result.Value.Slot.Candidates.Single(c => c.Id == "C").RejectedReason);
    }

    [Fact]
    public async Task Rejecting_Without_A_Reason_Is_Refused()
    {
        await ProposeTwo();

        var result = await Reject.Handle(
            new RejectSceneCandidatesCommand(SceneId, Slot, new[] { "B" }, "   "),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.RejectionReasonRequired", result.Error.Code);
    }

    [Fact]
    public async Task Choosing_A_Candidate_Puts_Its_Asset_On_The_Slots_Node()
    {
        await ProposeTwo();

        var result = await Resolve.Handle(
            new ResolveSceneSlotCommand(SceneId, Slot, "B", SceneSlotResolvers.User),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("B", result.Value.Slot.ChosenCandidateId);
        Assert.Equal(SceneSlotResolvers.User, result.Value.Slot.ResolvedBy);

        var document = SceneDocumentCodec.Parse(_scene.DocumentJson).Value;
        Assert.Equal(OtherLampId, document.Nodes.Single(n => n.Id == "lamp-1").Asset!.AssetId);
    }

    [Fact]
    public async Task Choosing_Preserves_The_Placement_The_Node_Already_Had()
    {
        // Swapping a candidate must not disturb anything the user already settled - which
        // here is where the lamp stands, not what it is.
        GivenScene(new SceneDocument(
            SceneDocument.CurrentSchemaVersion,
            new[]
            {
                new SceneNode(
                    "lamp-1",
                    new SceneTransform(new Vec3(3, 0, -2), new Vec3(0, 90, 0), Vec3.One),
                    Asset: new SceneAssetRef(SceneAssetTypes.Model, LampId, VersionId),
                    SlotId: Slot,
                    GroundSnap: true),
            },
            Array.Empty<SceneLight>(),
            SceneEnvironment.Default));

        await ProposeTwo();
        await Resolve.Handle(
            new ResolveSceneSlotCommand(SceneId, Slot, "B", SceneSlotResolvers.User), CancellationToken.None);

        var node = SceneDocumentCodec.Parse(_scene.DocumentJson).Value.Nodes.Single();
        Assert.Equal(3, node.Transform.Position.X, 6);
        Assert.Equal(-2, node.Transform.Position.Z, 6);
        Assert.Equal(90, node.Transform.RotationEuler.Y, 6);
        Assert.True(node.GroundSnap);
    }

    [Fact]
    public async Task A_Rejected_Candidate_Cannot_Be_Chosen_And_The_Refusal_Names_The_Reason()
    {
        await ProposeTwo();
        await Reject.Handle(
            new RejectSceneCandidatesCommand(SceneId, Slot, new[] { "B" }, "too modern"), CancellationToken.None);

        var result = await Resolve.Handle(
            new ResolveSceneSlotCommand(SceneId, Slot, "B", SceneSlotResolvers.Agent), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.CandidateRejected", result.Error.Code);
        Assert.Contains("too modern", result.Error.Message);
    }

    [Fact]
    public async Task Rejecting_The_Chosen_Candidate_Reopens_The_Slot()
    {
        await ProposeTwo();
        await Resolve.Handle(
            new ResolveSceneSlotCommand(SceneId, Slot, "B", SceneSlotResolvers.User), CancellationToken.None);

        var result = await Reject.Handle(
            new RejectSceneCandidatesCommand(SceneId, Slot, new[] { "B" }, "changed my mind"), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Null(result.Value.Slot.ChosenCandidateId);
        Assert.Null(result.Value.Slot.ResolvedBy);
        Assert.Equal(SceneSlotStatuses.Proposed, result.Value.Slot.Status);
    }

    [Fact]
    public async Task Reopening_A_Slot_Leaves_The_Node_Wearing_What_The_User_Can_See()
    {
        // Reopening a question is not withdrawing the answer everyone is looking at.
        await ProposeTwo();
        await Resolve.Handle(
            new ResolveSceneSlotCommand(SceneId, Slot, "B", SceneSlotResolvers.User), CancellationToken.None);

        var result = await Resolve.Handle(
            new ResolveSceneSlotCommand(SceneId, Slot, null, SceneSlotResolvers.User, Clear: true),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Null(result.Value.Slot.ChosenCandidateId);
        Assert.Equal(OtherLampId, SceneDocumentCodec.Parse(_scene.DocumentJson).Value.Nodes.Single().Asset!.AssetId);
    }

    [Fact]
    public async Task An_Agent_Choosing_And_A_User_Choosing_Are_Told_Apart()
    {
        await ProposeTwo();

        var agent = await Resolve.Handle(
            new ResolveSceneSlotCommand(SceneId, Slot, "B", SceneSlotResolvers.Agent), CancellationToken.None);
        Assert.Equal(SceneSlotResolvers.Agent, agent.Value.Slot.ResolvedBy);

        var user = await Resolve.Handle(
            new ResolveSceneSlotCommand(SceneId, Slot, "C", SceneSlotResolvers.User), CancellationToken.None);
        Assert.Equal(SceneSlotResolvers.User, user.Value.Slot.ResolvedBy);
    }

    [Fact]
    public async Task Undoing_The_Call_That_Opened_A_Slot_Removes_It_Again()
    {
        var proposed = await Propose.Handle(
            new ProposeSceneCandidatesCommand(SceneId, Slot, new[] { Proposal(OtherLampId) }),
            CancellationToken.None);

        Assert.Null(proposed.Value.Previous.Slot);

        var undone = await Restore.Handle(
            new RestoreSceneSlotCommand(SceneId, Slot, proposed.Value.Previous.Slot, proposed.Value.Previous.Node),
            CancellationToken.None);

        Assert.True(undone.IsSuccess);
        Assert.Null(SceneDocumentCodec.Parse(_scene.DocumentJson).Value.Slots);
    }

    [Fact]
    public async Task Undoing_A_Choice_Restores_Both_The_Slot_And_What_The_Node_Was_Wearing()
    {
        await ProposeTwo();

        var chosen = await Resolve.Handle(
            new ResolveSceneSlotCommand(SceneId, Slot, "B", SceneSlotResolvers.Agent), CancellationToken.None);

        var undone = await Restore.Handle(
            new RestoreSceneSlotCommand(SceneId, Slot, chosen.Value.Previous.Slot, chosen.Value.Previous.Node),
            CancellationToken.None);

        Assert.True(undone.IsSuccess);
        var document = SceneDocumentCodec.Parse(_scene.DocumentJson).Value;
        Assert.Null(document.Slots!.Single().ChosenCandidateId);
        Assert.Equal(LampId, document.Nodes.Single().Asset!.AssetId);
    }

    [Fact]
    public async Task Get_Slots_Reads_Back_Everything_The_Next_Round_Needs()
    {
        await ProposeTwo();
        await Reject.Handle(
            new RejectSceneCandidatesCommand(SceneId, Slot, null, "all too modern", All: true), CancellationToken.None);

        var result = await Slots.Handle(new GetSceneSlotsQuery(SceneId), CancellationToken.None);

        Assert.True(result.IsSuccess);
        var slot = Assert.Single(result.Value.Slots);
        Assert.Equal("low-poly, reads as rundown", slot.Brief);
        Assert.Equal("all too modern", slot.ReopenedReason);
        Assert.All(slot.Candidates, c => Assert.Equal("all too modern", c.RejectedReason));
    }

    [Fact]
    public async Task A_Second_Round_That_Does_Not_Restate_The_Brief_Is_Still_Looking_For_The_Same_Thing()
    {
        await ProposeTwo();

        var again = await Propose.Handle(
            new ProposeSceneCandidatesCommand(SceneId, Slot, new[] { Proposal(45) }), CancellationToken.None);

        Assert.Equal("low-poly, reads as rundown", again.Value.Slot.Brief);
    }

    [Fact]
    public async Task Choosing_A_Taller_Candidate_Re_Seats_A_Ground_Snapped_Node()
    {
        // The placement rules are properties of the node, so they re-resolve against
        // whatever the node now IS. Without that, swapping a 4 m lamp for a 6 m one on a
        // ground-snapped node would leave it hanging - or sunk - by the difference, and the
        // panel would report a choice the viewport contradicts.
        _facts.Setup(f => f.ResolveAsync(It.IsAny<IEnumerable<SceneAssetRef>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((IEnumerable<SceneAssetRef> assets, CancellationToken _) => assets
                .DistinctBy(SceneSpatial.FactsKey)
                .ToDictionary(
                    SceneSpatial.FactsKey,
                    a => new SceneAssetFacts(
                        a.AssetType, a.AssetId, a.VersionId,
                        new Vec3(0.4, a.AssetId == LampId ? 4 : 6, 0.4),
                        // Centred, so the resting height is half the height and the two
                        // candidates genuinely disagree about where the node belongs.
                        "centered"),
                    StringComparer.Ordinal));

        GivenScene(new SceneDocument(
            SceneDocument.CurrentSchemaVersion,
            new[]
            {
                new SceneNode(
                    "lamp-1",
                    SceneTransform.Identity,
                    Asset: new SceneAssetRef(SceneAssetTypes.Model, LampId, VersionId),
                    SlotId: Slot,
                    GroundSnap: true),
            },
            Array.Empty<SceneLight>(),
            SceneEnvironment.Default));

        await ProposeTwo();
        var result = await Resolve.Handle(
            new ResolveSceneSlotCommand(SceneId, Slot, "B", SceneSlotResolvers.User), CancellationToken.None);

        Assert.True(result.IsSuccess);
        var node = SceneDocumentCodec.Parse(_scene.DocumentJson).Value.Nodes.Single();
        Assert.Equal(3, node.Transform.Position.Y, 6);
    }

    [Fact]
    public async Task Removing_A_Slots_Node_Takes_The_Decision_With_It()
    {
        // Left behind, the slot would name a node that is not there - and since a
        // document is validated in full on every write, the scene would refuse every
        // later edit because of a node the user had already deleted.
        await ProposeTwo();

        var removed = await Remove.Handle(
            new RemoveSceneNodeCommand(SceneId, "lamp-1"), CancellationToken.None);

        Assert.True(removed.IsSuccess);
        Assert.Equal(Slot, removed.Value.RemovedSlot!.Id);
        Assert.Null(SceneDocumentCodec.Parse(_scene.DocumentJson).Value.Slots);

        // And the scene still takes writes, which is the half that was actually at risk.
        var reopened = await Slots.Handle(new GetSceneSlotsQuery(SceneId), CancellationToken.None);
        Assert.True(reopened.IsSuccess);
        Assert.Empty(reopened.Value.Slots);
    }

    [Fact]
    public async Task Undoing_That_Removal_Brings_The_Decision_Back_Too()
    {
        await ProposeTwo();

        var removed = await Remove.Handle(
            new RemoveSceneNodeCommand(SceneId, "lamp-1"), CancellationToken.None);

        var restored = await RestoreNode.Handle(
            new RestoreSceneNodeCommand(SceneId, removed.Value.RemovedNode, removed.Value.RemovedSlot),
            CancellationToken.None);

        Assert.True(restored.IsSuccess);
        var slot = Assert.Single(SceneDocumentCodec.Parse(_scene.DocumentJson).Value.Slots!);
        Assert.Equal(new[] { "A", "B", "C" }, slot.Candidates.Select(c => c.Id));
    }

    [Fact]
    public async Task A_Slot_Write_Against_A_Stale_Revision_Is_Refused()
    {
        await ProposeTwo();

        var result = await Reject.Handle(
            new RejectSceneCandidatesCommand(SceneId, Slot, new[] { "B" }, "too modern", ExpectedRevision: 0),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("Scene.RevisionConflict", result.Error.Code);
    }
}
