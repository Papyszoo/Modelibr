using Application.Scenes;
using Domain.Scenes;
using Xunit;

namespace Application.Tests.Scenes;

/// <summary>
/// What a choice card says a candidate is being measured against (prompt 13-D5).
///
/// <para>
/// The line is derived from the same profile the validator reads, never parsed out of the
/// agent's rationale: 05's cards already show real numbers, and the numbers are what let a
/// user overrule a plausible-sounding wrong answer - but a number the agent typed is one the
/// agent could have typed wrong.
/// </para>
/// </summary>
public class SceneCandidateProfileFitTests
{
    private const int LampId = 41;
    private const int VersionId = 7;

    private static readonly SceneAssetRef Lamp = new(SceneAssetTypes.Model, LampId, VersionId);

    private static SceneSlot SlotWith(SceneSlotCandidate candidate) =>
        new("streetlight", new[] { candidate });

    private static SceneSlotCandidate Candidate() =>
        new("A", Lamp, null, "reads as rundown", null, null);

    private static SceneDocument Document() =>
        new(
            SceneDocument.CurrentSchemaVersion,
            new[]
            {
                new SceneNode("lamp-1", SceneTransform.Identity, Asset: Lamp, SlotId: "streetlight"),
            },
            Array.Empty<SceneLight>(),
            SceneEnvironment.Default);

    private static IReadOnlyDictionary<string, SceneAssetProfile> Profiles(
        int? triangles, params string[] styles) =>
        new Dictionary<string, SceneAssetProfile>(StringComparer.Ordinal)
        {
            [SceneSpatial.FactsKey(Lamp)] = new(
                Lamp.AssetType, Lamp.AssetId, Lamp.VersionId,
                Name: "Street Lamp",
                TriangleCount: triangles,
                Styles: styles.Length == 0 ? null : styles),
        };

    private static SceneCandidateProfileFit? FitOf(
        IReadOnlyDictionary<string, SceneAssetProfile> profiles, SceneProjectConstraints? project) =>
        SceneSlotViewBuilder.Describe(
                SlotWith(Candidate()),
                Document(),
                new Dictionary<string, SceneAssetFacts>(StringComparer.Ordinal),
                profiles,
                null,
                project)
            .Candidates[0]
            .ProfileFit;

    private static SceneProjectConstraints LowPolyProject(int? budget = 5000) =>
        new(1, "Nightfall", budget, null,
            new[] { "Low Poly" },
            new[] { "photoscan", "scan", "realistic" },
            "Model");

    [Fact]
    public void AnUnlinkedScene_GetsNoProfileLineAtAll()
    {
        // Not an empty line: a card that prints "no budget" for a scene that belongs to no
        // project invents a constraint nobody set.
        Assert.Null(FitOf(Profiles(1800, "Low Poly"), null));
    }

    [Fact]
    public void ACandidateInsideTheBudget_SaysSoWithTheNumbers()
    {
        var fit = FitOf(Profiles(1800, "Low Poly"), LowPolyProject())!;

        Assert.True(fit.WithinBudget);
        Assert.Equal(1800, fit.Triangles);
        Assert.Equal(5000, fit.Budget);
        Assert.True(fit.DeclaresProjectStyle);
        Assert.Equal("1,800 triangles; inside the 5,000 budget; matches Low Poly.", fit.Summary);
    }

    [Fact]
    public void AnOverBudgetCandidate_IsStillProposedAndSaysItIsOver()
    {
        var fit = FitOf(Profiles(129693, "Low Poly"), LowPolyProject())!;

        Assert.False(fit.WithinBudget);
        Assert.Contains("over the 5,000 budget", fit.Summary);
    }

    [Fact]
    public void ACandidateThatDeclaresAStyleTheProjectRulesOut_NamesIt()
    {
        var fit = FitOf(Profiles(1800, "Realistic"), LowPolyProject())!;

        Assert.Equal(new[] { "Realistic" }, fit.Contradicts);
        Assert.False(fit.DeclaresProjectStyle);
        Assert.Contains("rules out", fit.Summary);
    }

    /// <summary>
    /// The library has zero authored styles today, so this is the common case rather than the
    /// edge one. Silence about an asset is not evidence against it - the line says nobody has
    /// said, and does not call it off-style.
    /// </summary>
    [Fact]
    public void ACandidateNobodyHasDescribed_IsNotCalledOffStyle()
    {
        var fit = FitOf(Profiles(1800), LowPolyProject())!;

        Assert.Empty(fit.Contradicts);
        Assert.False(fit.DeclaresProjectStyle);
        Assert.Contains("nothing says what style it is", fit.Summary);
    }

    [Fact]
    public void AProjectWithNoBudget_SaysThatRatherThanPassingSilently()
    {
        var fit = FitOf(Profiles(1800, "Low Poly"), LowPolyProject(budget: null))!;

        Assert.Null(fit.WithinBudget);
        Assert.Contains("sets no per-asset budget", fit.Summary);
    }

    [Fact]
    public void AnUnmeasuredCandidate_IsNeitherWithinNorOverTheBudget()
    {
        var fit = FitOf(Profiles(null, "Low Poly"), LowPolyProject())!;

        Assert.Null(fit.WithinBudget);
        Assert.Contains("triangle count unknown", fit.Summary);
    }
}
