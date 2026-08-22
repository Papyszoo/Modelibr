using Domain.Projects;
using Xunit;

namespace Domain.Tests.Unit;

public class ProjectStyleSignalsTests
{
    [Fact]
    public void AMappedStyle_CarriesItsCapsAndTokens()
    {
        var signals = ProjectStyleSignals.For("Low Poly");

        Assert.Equal(5000, signals.MaxTriangles);
        Assert.Contains("lowpoly", signals.BoostTokens);
        Assert.Contains("photoscan", signals.PenaltyTokens);
        Assert.Equal("Model", signals.FamilyHint);
    }

    [Fact]
    public void StyleNames_AreMatchedCaseInsensitively()
    {
        Assert.Equal(5000, ProjectStyleSignals.For("LOW POLY").MaxTriangles);
    }

    /// <summary>
    /// The failure mode this guards is total: if an unknown style produced a cap or an
    /// impossible token, every project using a user-added style would return an empty
    /// library.
    /// </summary>
    [Fact]
    public void AnUnmappedStyle_ConstrainsNothingAndStillContributesItsName()
    {
        var signals = ProjectStyleSignals.For("Vampire-Survivors-like");

        Assert.Null(signals.MaxTriangles);
        Assert.Null(signals.FamilyHint);
        Assert.Empty(signals.PenaltyTokens);
        Assert.Equal(new[] { "Vampire-Survivors-like" }, signals.BoostTokens);
        Assert.False(ProjectStyleSignals.IsMapped("Vampire-Survivors-like"));
    }

    /// <summary>
    /// `pbr` is the tempting penalty term and the wrong one: glTF is PBR by construction and
    /// most low-poly game packs ship PBR materials, so penalising it would demote most of the
    /// library. It belongs only to Retro / PS1, where it means "wrong era".
    /// </summary>
    [Fact]
    public void Pbr_IsNotPenalisedByLowPoly()
    {
        Assert.DoesNotContain("pbr", ProjectStyleSignals.For("Low Poly").PenaltyTokens);
        Assert.Contains("pbr", ProjectStyleSignals.For("Retro / PS1").PenaltyTokens);
    }

    [Fact]
    public void Merging_TakesTheStrictestCap()
    {
        var merged = ProjectStyleSignals.Merge(new[] { "Low Poly", "Retro / PS1" });

        // An asset that has to satisfy both styles has to fit the smaller budget.
        Assert.Equal(2000, merged.MaxTriangles);
        Assert.Equal(256, merged.MaxTextureSize);
    }

    [Fact]
    public void Merging_DropsATokenTheStylesDisagreeAbout()
    {
        var merged = ProjectStyleSignals.Merge(new[] { "Low Poly", "Realistic" });

        // Realistic boosts "scan"; Low Poly penalises it. Two styles disagreeing is not
        // evidence either way, and keeping it in both lists would make the ranking depend on
        // which was applied last.
        Assert.DoesNotContain("scan", merged.BoostTokens);
        Assert.DoesNotContain("scan", merged.PenaltyTokens);
    }

    [Fact]
    public void Merging_ContradictoryFamilyHints_AnswersNoHint()
    {
        var merged = ProjectStyleSignals.Merge(new[] { "Pixel Art", "Realistic" });

        // A project that is both is telling us its scenes differ, not that one style loses.
        Assert.Null(merged.FamilyHint);
    }

    [Fact]
    public void Merging_NoStyles_ConstrainsNothing()
    {
        var merged = ProjectStyleSignals.Merge(Array.Empty<string>());

        Assert.Null(merged.MaxTriangles);
        Assert.Empty(merged.BoostTokens);
    }
}

public class PlatformBudgetDefaultsTests
{
    [Fact]
    public void TheSuggestion_IsTheTightestSelectedPlatform()
    {
        var suggestion = PlatformBudgetDefaults.For(new[] { "PC", "Meta Quest" });

        // PC + Quest is a common pair with no sensible average: an asset that runs on both
        // has to fit the smaller one.
        Assert.NotNull(suggestion);
        Assert.Equal(5_000, suggestion!.MaxTrianglesPerAsset);
        // Naming the platform is what tells the user that dropping Quest raises the budget.
        Assert.Equal("Meta Quest", suggestion.Platform);
    }

    [Fact]
    public void UnknownPlatforms_SuggestNothingRatherThanADefault()
    {
        Assert.Null(PlatformBudgetDefaults.For(new[] { "Dreamcast" }));
        Assert.Null(PlatformBudgetDefaults.For(Array.Empty<string>()));
    }
}

public class EngineConventionsTests
{
    [Fact]
    public void KnownEngines_ReportTheirConvention()
    {
        var unreal = EngineConventions.For("Unreal");

        Assert.NotNull(unreal);
        Assert.Equal(100.0, unreal!.UnitsPerMetre);
        Assert.Equal("Z", unreal.UpAxis);
        Assert.Equal("left", unreal.Handedness);
    }

    [Fact]
    public void AnUnknownEngine_ContributesNothingRatherThanAGuess()
    {
        Assert.Null(EngineConventions.For("Löve"));
        Assert.Empty(EngineConventions.ForAll(new[] { "Löve", "Bevy" }));
    }

    /// <summary>
    /// The user's own example: Blender for authoring and Unity for rendering, everything
    /// working in both. The two disagree on up axis and handedness, and the brief has to say
    /// so - an agent that cannot see the conflict satisfies exactly one of them.
    /// </summary>
    [Fact]
    public void EnginesThatDisagree_AreReportedAsAConflict()
    {
        var conflicts = EngineConventions.Conflicts(new[] { "Blender", "Unity" });

        Assert.Contains(conflicts, c => c.StartsWith("up axis"));
        Assert.Contains(conflicts, c => c.StartsWith("handedness"));
    }

    [Fact]
    public void OneEngine_CannotConflictWithItself()
    {
        Assert.Empty(EngineConventions.Conflicts(new[] { "Unity" }));
    }

    [Fact]
    public void EnginesThatAgree_ReportNoConflict()
    {
        Assert.Empty(EngineConventions.Conflicts(new[] { "Unity", "Unreal" }.Take(1)));
        Assert.Empty(EngineConventions.Conflicts(new[] { "Godot", "three.js" }));
    }
}
