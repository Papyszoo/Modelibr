using Domain.Scenes;
using Xunit;

namespace Domain.Tests.Unit;

/// <summary>
/// Staged authoring: composition first, colour last.
///
/// Two rules carry the whole feature, and both are asserted here rather than trusted to a
/// comment. A scene that has not claimed a stage is judged exactly as it was before stages
/// existed - the feature must not quietly weaken the checks a caller already had. And a scene
/// that <i>has</i> claimed one cannot claim a later one while its composition contradicts it,
/// which is the mechanism that would have stopped a run spending four lighting attempts on a
/// room where every object floated half its height.
/// </summary>
public class SceneStageTests
{
    private const string ModelType = SceneAssetTypes.Model;

    private static readonly Vec3 BaseAtOrigin = new(0.5, 0, 0.5);

    private static SceneNode Node(string id, Vec3 position, int assetId = 1, bool? groundSnap = null) =>
        new(
            id,
            new SceneTransform(position, Vec3.Zero, Vec3.One),
            Asset: new SceneAssetRef(ModelType, assetId, 1),
            GroundSnap: groundSnap);

    private static Dictionary<string, SceneAssetFacts> Facts(params (int AssetId, Vec3 Dimensions)[] assets)
    {
        var facts = new Dictionary<string, SceneAssetFacts>(StringComparer.Ordinal);
        foreach (var (assetId, dimensions) in assets)
        {
            var reference = new SceneAssetRef(ModelType, assetId, 1);
            facts[SceneSpatial.FactsKey(reference)] =
                new SceneAssetFacts(ModelType, assetId, 1, dimensions, OriginInBounds: BaseAtOrigin);
        }

        return facts;
    }

    private static Dictionary<string, SceneAssetProfile> Profiles(params SceneAssetProfile[] profiles)
    {
        var byKey = new Dictionary<string, SceneAssetProfile>(StringComparer.Ordinal);
        foreach (var profile in profiles)
        {
            byKey[SceneSpatial.FactsKey(new SceneAssetRef(profile.AssetType, profile.AssetId, profile.VersionId))] = profile;
        }

        return byKey;
    }

    /// <summary>A model with no material of its own - what Appearance.NoMaterial fires on.</summary>
    private static SceneAssetProfile Untextured(int assetId) => new(ModelType, assetId, 1, PartCount: 1, MaterialCount: 0);

    /// <summary>One grey box on the floor, unlit and undressed - a blockout, in other words.</summary>
    private static SceneDocument Blockout(string? stage) =>
        new(
            SceneDocument.CurrentSchemaVersion,
            new[] { Node("sofa", Vec3.Zero, groundSnap: true) },
            Array.Empty<SceneLight>(),
            Stage: stage);

    private static SceneFinding Find(SceneValidationReport report, string code) =>
        Assert.Single(report.Findings, f => f.Code == code);

    // --- The vocabulary and its order ---------------------------------------

    [Theory]
    [InlineData(SceneStages.Layout, SceneStages.Detail, true)]
    [InlineData(SceneStages.Layout, SceneStages.Dressed, true)]
    [InlineData(SceneStages.Dressed, SceneStages.Layout, false)]
    [InlineData(SceneStages.Lit, SceneStages.Lit, false)]
    public void An_Advance_Is_A_Move_Towards_Dressed(string from, string to, bool expected) =>
        Assert.Equal(expected, SceneStages.IsAdvance(from, to));

    [Fact]
    public void Declaring_A_Stage_On_An_Unstaged_Scene_Is_An_Advance()
    {
        // An unstaged scene sits before every stage, so the first claim it makes is gated
        // like any other. Declaring "this is dressed" over a broken room is exactly the
        // claim worth refusing.
        Assert.True(SceneStages.IsAdvance(null, SceneStages.Layout));
        Assert.False(SceneStages.IsAdvance(SceneStages.Layout, null));
    }

    [Fact]
    public void The_Order_Is_The_Vocabulary_Order()
    {
        // Order() is written out rather than derived from All, so this keeps the two from
        // drifting - a stage that ranked wrong would gate the wrong writes.
        Assert.Equal(
            SceneStages.All.ToList(),
            SceneStages.All.OrderBy(stage => SceneStages.Order(stage)!.Value).ToList());
    }

    [Fact]
    public void An_Unknown_Stage_Is_Rejected_Rather_Than_Ranked()
    {
        // A typo that ranked as "no stage" would silently un-gate the write the caller was
        // trying to gate.
        Assert.Null(SceneStages.Order("blockout"));
        Assert.False(SceneStages.IsStage("blockout"));

        var issues = SceneDocumentValidator.Validate(Blockout("blockout"));

        Assert.Contains(issues, i => i.Code == "UnknownStage");
    }

    // --- What a stage changes about validation -------------------------------

    [Fact]
    public void An_Unstaged_Scene_Is_Judged_On_Everything_At_Once()
    {
        var report = SceneValidator.Validate(Blockout(null), Facts((1, new Vec3(1.6, 0.8, 0.9))), Profiles(Untextured(1)));

        Assert.Equal(SceneFindingSeverities.Warning, Find(report, "Appearance.Unlit").Severity);
        Assert.Equal(SceneFindingSeverities.Warning, Find(report, "Appearance.NoMaterial").Severity);
        Assert.Equal(SceneVerdicts.Warnings, report.Verdict);
    }

    [Fact]
    public void A_Scene_Being_Blocked_Out_Is_Not_Faulted_For_Being_A_Grey_Box()
    {
        // The findings are still there - demoted, not dropped. A check that goes silent is
        // indistinguishable from a check that passed, which is the failure the whole
        // validation feature exists to prevent.
        var report = SceneValidator.Validate(
            Blockout(SceneStages.Layout), Facts((1, new Vec3(1.6, 0.8, 0.9))), Profiles(Untextured(1)));

        Assert.Equal(SceneFindingSeverities.Info, Find(report, "Appearance.Unlit").Severity);
        Assert.Equal(SceneFindingSeverities.Info, Find(report, "Appearance.NoMaterial").Severity);
        Assert.Equal(SceneVerdicts.Ok, report.Verdict);
        Assert.Contains(report.Coverage.Limitations, l => l.Contains("'layout' stage", StringComparison.Ordinal));
        Assert.Equal(SceneStages.Layout, report.Coverage.Stage);
    }

    [Fact]
    public void Light_Becomes_Due_At_Lit_And_Material_Only_At_Dressed()
    {
        var report = SceneValidator.Validate(
            Blockout(SceneStages.Lit), Facts((1, new Vec3(1.6, 0.8, 0.9))), Profiles(Untextured(1)));

        Assert.Equal(SceneFindingSeverities.Warning, Find(report, "Appearance.Unlit").Severity);
        Assert.Equal(SceneFindingSeverities.Info, Find(report, "Appearance.NoMaterial").Severity);
    }

    [Fact]
    public void A_Floating_Node_Is_A_Problem_At_Every_Stage()
    {
        // The point of the order: appearance waits, composition never does.
        foreach (var stage in new[] { SceneStages.Layout, SceneStages.Detail, SceneStages.Lit, SceneStages.Dressed })
        {
            var document = new SceneDocument(
                SceneDocument.CurrentSchemaVersion,
                new[] { Node("sofa", new Vec3(0, 3, 0), groundSnap: true) },
                Array.Empty<SceneLight>(),
                Stage: stage);

            var report = SceneValidator.Validate(document, Facts((1, new Vec3(1.6, 0.8, 0.9))));

            Assert.Equal(SceneFindingSeverities.Error, Find(report, "Contact.GroundSnapFloating").Severity);
            Assert.Equal(SceneVerdicts.Errors, report.Verdict);
        }
    }

    // --- The gate ------------------------------------------------------------

    private static SceneDocument Staged(string? stage, params SceneNode[] nodes) =>
        new(SceneDocument.CurrentSchemaVersion, nodes, Array.Empty<SceneLight>(), Stage: stage);

    [Fact]
    public void Advancing_Over_A_Levitating_Scene_Is_Blocked()
    {
        // Deliberately the *undeclared* floater rather than a broken groundSnap. Blocking on
        // error-severity findings alone would make this gate dead code: ResolvePlacements runs
        // on every write and repairs every contact error before one can be stored, so
        // Contact.Unsupported - a warning - is the one that actually survives, and it is the
        // one that shipped the broken living room.
        var floating = Node("sofa", new Vec3(0, 3, 0));

        var (blocking, _) = SceneStageGate.Check(
            Staged(SceneStages.Layout, floating),
            Staged(SceneStages.Dressed, floating),
            Facts((1, new Vec3(1.6, 0.8, 0.9))));

        Assert.Equal("Contact.Unsupported", Assert.Single(blocking).Code);
    }

    [Fact]
    public void Declaring_A_Node_Suspended_Answers_The_Gate()
    {
        // The escape, and the reason the gate is a question rather than a wall: a pendant lamp
        // is meant to hang, and saying so is a durable fact about the node rather than a way
        // past one call.
        var hanging = Node("pendant", new Vec3(0, 2.4, 0)) with { Suspended = true };

        var (blocking, _) = SceneStageGate.Check(
            Staged(SceneStages.Layout, hanging),
            Staged(SceneStages.Dressed, hanging),
            Facts((1, new Vec3(0.3, 0.4, 0.3))));

        Assert.Empty(blocking);
    }

    [Fact]
    public void A_Suspended_Node_Cannot_Also_Rest_On_Something()
    {
        // Three answers to "what holds this up" that contradict each other. Picking one
        // silently would leave the caller believing something the scene does not do.
        var confused = Node("pendant", new Vec3(0, 2.4, 0), groundSnap: true) with { Suspended = true };

        var issues = SceneDocumentValidator.Validate(Staged(SceneStages.Layout, confused));

        Assert.Contains(issues, i => i.Code == "SuspendedAndSupported");
    }

    [Fact]
    public void Retreating_Is_Never_Blocked()
    {
        // Going back is how a scene is reopened to fix exactly the problem the gate found.
        var floating = Node("sofa", new Vec3(0, 3, 0));

        var (blocking, carried) = SceneStageGate.Check(
            Staged(SceneStages.Dressed, floating),
            Staged(SceneStages.Layout, floating),
            Facts((1, new Vec3(1.6, 0.8, 0.9))));

        Assert.Empty(blocking);
        Assert.Empty(carried);
    }

    [Fact]
    public void An_Ordinary_Write_Into_A_Half_Built_Scene_Is_Not_Gated()
    {
        // The gate asks its question when the scene claims to have moved on, not on every
        // placement into a scene that is still being built.
        var floating = Node("sofa", new Vec3(0, 3, 0));

        var (blocking, _) = SceneStageGate.Check(
            Staged(SceneStages.Layout, floating),
            Staged(SceneStages.Layout, floating, Node("lamp", Vec3.Zero, assetId: 2)),
            Facts((1, new Vec3(1.6, 0.8, 0.9)), (2, new Vec3(0.3, 1.6, 0.3))));

        Assert.Empty(blocking);
    }

    [Fact]
    public void Geometry_Below_The_Floor_Is_Carried_Rather_Than_Refused()
    {
        // Containment does not block, and the reason is that it cannot be answered: nothing in
        // the document can declare a sunken bath or a foundation deliberate, and a gate with no
        // answer is a gate that gets worked around. It is still worth saying once.
        var sunken = Node("pool", new Vec3(0, -1.2, 0));

        var (blocking, carried) = SceneStageGate.Check(
            Staged(SceneStages.Lit, sunken),
            Staged(SceneStages.Dressed, sunken),
            Facts((1, new Vec3(3, 1, 3))));

        Assert.Empty(blocking);
        Assert.Equal("Containment.BelowFloor", Assert.Single(carried).Code);
    }

    [Fact]
    public void A_Write_That_Fixes_The_Scene_And_Advances_It_Is_Allowed()
    {
        // Judged on the candidate document, not on what is stored. Otherwise the one write
        // that repairs the composition and moves on would be refused for the state it fixed.
        var (blocking, _) = SceneStageGate.Check(
            Staged(SceneStages.Layout, Node("sofa", new Vec3(0, 3, 0))),
            Staged(SceneStages.Detail, Node("sofa", Vec3.Zero, groundSnap: true)),
            Facts((1, new Vec3(1.6, 0.8, 0.9))));

        Assert.Empty(blocking);
    }
}
