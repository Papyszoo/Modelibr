using Domain.Scenes;
using Xunit;

namespace Domain.Tests.Unit;

/// <summary>
/// The validator's profile tier (prompt 13-D4). Findings, never refusals - a budget is a
/// target and the author may knowingly blow it.
/// </summary>
public class SceneValidatorProfileTests
{
    private static SceneAssetRef Ref(int id) => new("Model", id);

    private static SceneNode Node(string id, int assetId) =>
        new(id, SceneTransform.Identity, Ref(assetId));

    private static SceneDocument Document(string? stage, params SceneNode[] nodes) =>
        new(1, nodes.ToList(), Array.Empty<SceneLight>(), null, stage);

    private static IReadOnlyDictionary<string, SceneAssetProfile> Profiles(
        params (int AssetId, string Name, int? Triangles, string[]? Styles)[] assets)
        => assets.ToDictionary(
            a => SceneSpatial.FactsKey(Ref(a.AssetId)),
            a => new SceneAssetProfile(
                "Model", a.AssetId, null, a.Name,
                TriangleCount: a.Triangles,
                Styles: a.Styles),
            StringComparer.Ordinal);

    private static IReadOnlyDictionary<string, SceneAssetFacts> NoFacts()
        => new Dictionary<string, SceneAssetFacts>(StringComparer.Ordinal);

    private static SceneProjectConstraints Project(
        int? cap = null,
        int? sceneCap = null,
        string[]? styles = null,
        string[]? penalties = null,
        string? familyHint = null)
        => new(1, "Nightfall", cap, sceneCap, styles, penalties, familyHint);

    private static IReadOnlyList<SceneFinding> ProfileFindings(SceneValidationReport report)
        => report.Findings.Where(f => f.Check == SceneChecks.Profile).ToList();

    [Fact]
    public void AnUnlinkedScene_IsNotAFinding_ItIsALimitation()
    {
        var report = SceneValidator.Validate(
            Document(SceneStages.Detail, Node("a", 1)), NoFacts(), Profiles((1, "Sofa", 900, null)));

        // Belonging to no project is not a thing that is wrong with a scene. A note on every
        // scene in the library would make "no findings" mean nothing.
        Assert.Empty(ProfileFindings(report));
        Assert.Contains(report.Coverage.Limitations, l => l.Contains("belongs to no project"));
    }

    [Fact]
    public void AnAssetOverTheCap_IsReportedFromTheDetailStage()
    {
        var report = SceneValidator.Validate(
            Document(SceneStages.Detail, Node("a", 1)),
            NoFacts(),
            Profiles((1, "Sofa", 9_000, null)),
            Project(cap: 5_000));

        var finding = Assert.Single(ProfileFindings(report), f => f.Code == "OverBudgetAsset");
        Assert.Equal(SceneFindingSeverities.Info, finding.Severity);
        Assert.Contains("9,000", finding.Message);
        // Invariant formatting, so the wording does not depend on the server's locale.
        Assert.Contains("5,000", finding.Message);
    }

    [Fact]
    public void AnAssetOverTheCap_IsNotReportedWhileTheSceneIsStillBeingBlockedOut()
    {
        var report = SceneValidator.Validate(
            Document(SceneStages.Layout, Node("a", 1)),
            NoFacts(),
            Profiles((1, "Sofa", 9_000, null)),
            Project(cap: 5_000));

        Assert.Empty(ProfileFindings(report));
    }

    /// <summary>
    /// The split that matters: taste waits for the dressing stage, but "that is the wrong
    /// asset" is structural and is said while the scene is still grey - by the dressing stage
    /// a whole hierarchy has been built around it.
    /// </summary>
    [Fact]
    public void AGrossOverrun_IsReportedAtLayout()
    {
        var report = SceneValidator.Validate(
            Document(SceneStages.Layout, Node("a", 1)),
            NoFacts(),
            Profiles((1, "Photoscan playset", 129_693, null)),
            Project(cap: 5_000));

        var finding = Assert.Single(ProfileFindings(report), f => f.Code == "GrossOverBudgetAsset");
        Assert.Equal(SceneFindingSeverities.Warning, finding.Severity);
    }

    [Fact]
    public void AWrongFamily_IsReportedAtEveryStage()
    {
        var report = SceneValidator.Validate(
            Document(SceneStages.Layout, Node("a", 1)),
            NoFacts(),
            Profiles((1, "Chair", 500, null)),
            Project(familyHint: "Sprite"));

        var finding = Assert.Single(ProfileFindings(report), f => f.Code == "WrongAssetFamily");
        Assert.Equal(SceneFindingSeverities.Warning, finding.Severity);
    }

    [Fact]
    public void TheSceneTotal_IsReportedAgainstTheProjectsTarget()
    {
        var report = SceneValidator.Validate(
            Document(SceneStages.Detail, Node("a", 1), Node("b", 2)),
            NoFacts(),
            Profiles((1, "Sofa", 4_000, null), (2, "Table", 4_000, null)),
            Project(sceneCap: 5_000));

        var finding = Assert.Single(ProfileFindings(report), f => f.Code == "SceneOverBudget");
        Assert.Contains("8,000", finding.Message);
    }

    [Fact]
    public void AnOffStyleAsset_IsANoteAndOnlyOnceTheSceneIsDressed()
    {
        var project = Project(styles: new[] { "Low Poly" }, penalties: new[] { "Realistic" });
        var profiles = Profiles((1, "Scanned sofa", 900, new[] { "Realistic" }));

        var duringDetail = SceneValidator.Validate(
            Document(SceneStages.Detail, Node("a", 1)), NoFacts(), profiles, project);
        var whenDressed = SceneValidator.Validate(
            Document(SceneStages.Dressed, Node("a", 1)), NoFacts(), profiles, project);

        Assert.DoesNotContain(ProfileFindings(duringDetail), f => f.Code == "OffStyleAsset");
        var finding = Assert.Single(ProfileFindings(whenDressed), f => f.Code == "OffStyleAsset");
        // Style is a judgement, and a validator that cries wolf about taste stops being read
        // about geometry.
        Assert.Equal(SceneFindingSeverities.Info, finding.Severity);
    }

    [Fact]
    public void AnAssetNobodyDescribed_IsNeverCalledOffStyle()
    {
        var report = SceneValidator.Validate(
            Document(SceneStages.Dressed, Node("a", 1)),
            NoFacts(),
            Profiles((1, "Sofa", 900, null)),
            Project(styles: new[] { "Low Poly" }, penalties: new[] { "Realistic" }));

        // Silence about an asset is not evidence against it, and on a library where nothing
        // has been described yet this is every asset.
        Assert.DoesNotContain(ProfileFindings(report), f => f.Code == "OffStyleAsset");
    }

    [Fact]
    public void AnAssetWithNoTriangleCount_IsNotJudgedAgainstTheBudget()
    {
        var report = SceneValidator.Validate(
            Document(SceneStages.Detail, Node("a", 1)),
            NoFacts(),
            Profiles((1, "Un-extracted", null, null)),
            Project(cap: 5_000));

        Assert.Empty(ProfileFindings(report));
    }

    [Fact]
    public void ProfileFindings_NeverMakeTheVerdictAnError()
    {
        var report = SceneValidator.Validate(
            Document(SceneStages.Detail, Node("a", 1)),
            NoFacts(),
            Profiles((1, "Photoscan", 129_693, null)),
            Project(cap: 5_000, familyHint: "Sprite"));

        // A budget is a target. The author may knowingly blow it, so the worst the profile
        // tier can do is warn.
        Assert.NotEqual(SceneVerdicts.Errors, report.Verdict);
    }
}
