using Domain.Scenes;
using Xunit;

namespace Domain.Tests.Unit;

/// <summary>
/// The rules that keep an open decision honest.
///
/// Every one of these exists because the alternative is a scene that claims something about
/// a decision which is not true: a choice nobody made, a proposal that is both picked and
/// ruled out, two nodes fighting over one slot. A validator that repaired any of these would
/// be deciding for the user, which is precisely what the slot model exists to stop.
/// </summary>
public class SceneSlotValidationTests
{
    private static SceneAssetRef Model(int id = 1) => new(SceneAssetTypes.Model, id, 7);

    private static SceneNode SlotNode(string slotId, string nodeId = "node") =>
        new(nodeId, SceneTransform.Identity, Asset: Model(), SlotId: slotId);

    private static SceneDocument DocumentWith(SceneSlot slot, params SceneNode[] nodes) =>
        new(SceneDocument.CurrentSchemaVersion,
            nodes.Length == 0 ? new[] { SlotNode(slot.Id) } : nodes,
            Array.Empty<SceneLight>(),
            SceneEnvironment.Default,
            Slots: new[] { slot });

    private static SceneSlotCandidate Candidate(string id, string? rejected = null) =>
        new(id, Model(), Rationale: "fits the brief", RejectedReason: rejected);

    [Fact]
    public void A_Slot_With_Open_Candidates_And_A_Node_Is_Valid()
    {
        var slot = new SceneSlot("streetlight", new[] { Candidate("A"), Candidate("B") }, Brief: "rundown");

        Assert.Empty(SceneDocumentValidator.Validate(DocumentWith(slot)));
    }

    [Fact]
    public void A_Store_Candidate_Needs_No_Library_Asset()
    {
        // The point of part B: an agent can put something the library does not have on the
        // table. It is a proposal, not a placement, so it needs nothing local at all.
        var slot = new SceneSlot("streetlight", new[]
        {
            new SceneSlotCandidate(
                "A",
                Rationale: "nothing in the library is low-poly",
                StoreAsset: new SceneStoreAssetRef(
                    "https://store.modelibr.com",
                    "47f60614-522f-4ced-941c-318ac5c7bd34",
                    "Quaternius: Ultimate Furniture Pack",
                    Price: 0m))
        });

        Assert.Empty(SceneDocumentValidator.Validate(DocumentWith(slot)));
    }

    [Fact]
    public void A_Candidate_Naming_Both_A_Library_And_A_Store_Asset_Is_Rejected()
    {
        // Two answers with two different costs, and they are settled differently. Folding
        // them into one card would make "choose A" ambiguous about whether anything is
        // downloaded.
        var slot = new SceneSlot("streetlight", new[]
        {
            new SceneSlotCandidate(
                "A",
                Model(),
                StoreAsset: new SceneStoreAssetRef("https://store.modelibr.com", "abc"))
        });

        var issues = SceneDocumentValidator.Validate(DocumentWith(slot));

        Assert.Contains(issues, i => i.Code == "CandidateHasBothAssets");
    }

    [Fact]
    public void A_Store_Candidate_On_An_Insecure_Store_Is_Rejected()
    {
        // The importer refuses anything but https, so a candidate naming one could never be
        // acquired - failing here beats failing after the user accepts it.
        var slot = new SceneSlot("streetlight", new[]
        {
            new SceneSlotCandidate(
                "A",
                StoreAsset: new SceneStoreAssetRef("http://store.example.com", "abc"))
        });

        var issues = SceneDocumentValidator.Validate(DocumentWith(slot));

        Assert.Contains(issues, i => i.Code == "InsecureStoreUrl");
    }

    [Fact]
    public void A_Document_Written_Before_Slots_Existed_Is_Still_Valid()
    {
        // The whole compatibility claim in one assertion: slots are absent, not empty, on
        // every scene composed before this feature, and the codec rejects unknown members.
        var document = new SceneDocument(
            SceneDocument.CurrentSchemaVersion,
            new[] { new SceneNode("lamp", SceneTransform.Identity, Asset: Model()) },
            Array.Empty<SceneLight>());

        Assert.Empty(SceneDocumentValidator.Validate(document));
    }

    [Fact]
    public void A_Slot_With_No_Node_Is_Rejected()
    {
        var slot = new SceneSlot("streetlight", new[] { Candidate("A") });
        var document = new SceneDocument(
            SceneDocument.CurrentSchemaVersion,
            new[] { new SceneNode("lamp", SceneTransform.Identity, Asset: Model()) },
            Array.Empty<SceneLight>(),
            SceneEnvironment.Default,
            Slots: new[] { slot });

        Assert.Contains(SceneDocumentValidator.Validate(document), i => i.Code == "SlotNodeMissing");
    }

    [Fact]
    public void Two_Nodes_Claiming_One_Slot_Are_Rejected()
    {
        // Two nodes for one slot would put the rejected option on stage next to the chosen
        // one, and leave "apply the choice" with no single node to apply it to.
        var slot = new SceneSlot("streetlight", new[] { Candidate("A") });
        var document = DocumentWith(slot, SlotNode("streetlight", "a"), SlotNode("streetlight", "b"));

        Assert.Contains(SceneDocumentValidator.Validate(document), i => i.Code == "DuplicateSlotNode");
    }

    [Fact]
    public void Two_Slots_Sharing_An_Id_Are_Rejected()
    {
        var document = new SceneDocument(
            SceneDocument.CurrentSchemaVersion,
            new[] { SlotNode("streetlight") },
            Array.Empty<SceneLight>(),
            SceneEnvironment.Default,
            Slots: new[]
            {
                new SceneSlot("streetlight", new[] { Candidate("A") }),
                new SceneSlot("streetlight", new[] { Candidate("A") }),
            });

        Assert.Contains(SceneDocumentValidator.Validate(document), i => i.Code == "DuplicateSlotId");
    }

    [Fact]
    public void Two_Candidates_Sharing_An_Id_Are_Rejected()
    {
        var slot = new SceneSlot("streetlight", new[] { Candidate("A"), Candidate("A") });

        Assert.Contains(SceneDocumentValidator.Validate(DocumentWith(slot)), i => i.Code == "DuplicateCandidateId");
    }

    [Fact]
    public void A_Candidate_Proposing_Nothing_Is_Rejected()
    {
        var slot = new SceneSlot("streetlight", new[] { new SceneSlotCandidate("A") });

        Assert.Contains(SceneDocumentValidator.Validate(DocumentWith(slot)), i => i.Code == "EmptyCandidate");
    }

    [Fact]
    public void A_Candidate_Model_Without_A_Pinned_Version_Is_Rejected()
    {
        // The same pin every scene reference carries. A candidate that re-points itself when
        // the model is re-uploaded would offer the user one thing and place another.
        var slot = new SceneSlot("streetlight", new[]
        {
            new SceneSlotCandidate("A", new SceneAssetRef(SceneAssetTypes.Model, 1, VersionId: null)),
        });

        Assert.Contains(
            SceneDocumentValidator.Validate(DocumentWith(slot)),
            i => i.Code == "VersionRequired" && i.Path == "slots[0].candidates[0].asset.versionId");
    }

    [Fact]
    public void A_Chosen_Candidate_That_Does_Not_Exist_Is_Rejected()
    {
        var slot = new SceneSlot("streetlight", new[] { Candidate("A") }, ChosenCandidateId: "Z", ResolvedBy: SceneSlotResolvers.User);

        Assert.Contains(SceneDocumentValidator.Validate(DocumentWith(slot)), i => i.Code == "ChosenCandidateNotFound");
    }

    [Fact]
    public void A_Candidate_Both_Chosen_And_Rejected_Is_Rejected()
    {
        var slot = new SceneSlot(
            "streetlight",
            new[] { Candidate("A", rejected: "too modern") },
            ChosenCandidateId: "A",
            ResolvedBy: SceneSlotResolvers.User);

        Assert.Contains(SceneDocumentValidator.Validate(DocumentWith(slot)), i => i.Code == "ChosenCandidateRejected");
    }

    [Fact]
    public void A_Choice_With_No_Resolver_Is_Rejected()
    {
        // Who decided is the one thing this model exists to keep. A scene that cannot answer
        // it can no longer tell an agent's pick from a person's.
        var slot = new SceneSlot("streetlight", new[] { Candidate("A") }, ChosenCandidateId: "A");

        Assert.Contains(SceneDocumentValidator.Validate(DocumentWith(slot)), i => i.Code == "ChoiceWithoutResolver");
    }

    [Fact]
    public void A_Resolver_With_No_Choice_Is_Rejected()
    {
        var slot = new SceneSlot("streetlight", new[] { Candidate("A") }, ResolvedBy: SceneSlotResolvers.Agent);

        Assert.Contains(SceneDocumentValidator.Validate(DocumentWith(slot)), i => i.Code == "ResolverWithoutChoice");
    }

    [Fact]
    public void An_Unknown_Resolver_Is_Rejected()
    {
        var slot = new SceneSlot("streetlight", new[] { Candidate("A") }, ChosenCandidateId: "A", ResolvedBy: "the vibes");

        Assert.Contains(SceneDocumentValidator.Validate(DocumentWith(slot)), i => i.Code == "UnknownSlotResolver");
    }

    [Theory]
    [InlineData(0, "A")]
    [InlineData(1, "B")]
    [InlineData(25, "Z")]
    [InlineData(26, "AA")]
    [InlineData(27, "AB")]
    [InlineData(51, "AZ")]
    [InlineData(52, "BA")]
    public void Candidate_Ids_Follow_The_Spreadsheet_Sequence(int index, string expected)
    {
        Assert.Equal(expected, SceneSlotIds.At(index));
    }

    [Fact]
    public void Allocating_Skips_Every_Id_The_Slot_Has_Ever_Held()
    {
        // The requirement's core. B was rejected and C chosen; the next proposal must be D,
        // because "I don't like B" has to mean the same asset in two turns of one conversation.
        var slot = new SceneSlot("streetlight", new[]
        {
            Candidate("A", rejected: "too clean"),
            Candidate("B", rejected: "too modern"),
            Candidate("C"),
        });

        Assert.Equal(new[] { "D", "E" }, SceneSlotIds.Allocate(slot, 2));
    }

    [Fact]
    public void A_Slot_Status_Is_Read_Off_Its_Candidates()
    {
        var open = new SceneSlot("s", new[] { Candidate("A") });
        var chosen = open with { ChosenCandidateId = "A", ResolvedBy = SceneSlotResolvers.User };
        var exhausted = new SceneSlot("s", new[] { Candidate("A", rejected: "no") });

        Assert.Equal(SceneSlotStatuses.Proposed, open.Status);
        Assert.Equal(SceneSlotStatuses.Chosen, chosen.Status);
        Assert.Equal(SceneSlotStatuses.Rejected, exhausted.Status);
    }
}
