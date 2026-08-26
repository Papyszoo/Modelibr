using Application.Search;
using Domain.Models;
using Domain.Projects;
using Xunit;

namespace Application.Tests.Search;

/// <summary>
/// What a project's profile does to a search (prompt 13-D3), tested where the judgements live
/// rather than through SQL: which cap wins, what an unmapped style contributes, and whether the
/// response says enough for a caller to disagree with it.
/// </summary>
public class ProfileSearchBiasTests
{
    private static readonly DateTime Now = new(2026, 8, 23, 0, 0, 0, DateTimeKind.Utc);

    private static int _nextOptionId = 1;

    private static Project ProjectWith(string[] styles, Action<Project>? configure = null)
    {
        var project = Project.Create("Nightfall", "A small horror game.", Now);

        var options = styles
            .Select(name =>
            {
                var option = ProjectProfileOption.Create(
                    ProjectProfileDimensions.Style, name, Now, isBuiltIn: true);
                typeof(ProjectProfileOption).GetProperty("Id")!.SetValue(option, _nextOptionId++);
                return option;
            })
            .ToList();

        if (options.Count > 0)
        {
            project.SetProfileDimension(
                ProjectProfileDimensions.Style,
                options.ToDictionary(o => o.Id, _ => (string?)null),
                options.ToDictionary(o => o.Id, o => o.Dimension),
                Now);

            foreach (var value in project.ProfileValues)
            {
                typeof(ProjectProfileValue).GetProperty("Option")!
                    .SetValue(value, options.Single(o => o.Id == value.OptionId));
            }
        }

        configure?.Invoke(project);
        return project;
    }

    private static void GiveBudget(Project project, int maxTrianglesPerAsset) =>
        project.SetProfileSettings(maxTrianglesPerAsset, null, null, null, null, null, null, null, Now);

    [Fact]
    public void AStyle_ContributesItsBoostAndPenaltyTokens()
    {
        var bias = ProfileSearchBiasBuilder.Build(
            ProjectWith(new[] { "Low Poly" }), AssetSearchProfileModes.Bias);

        Assert.Equal(new[] { "Low Poly" }, bias.Styles);
        Assert.Contains("lowpoly", bias.BoostTokens);
        Assert.Contains("photoscan", bias.PenaltyTokens);
        Assert.Equal("Model", bias.FamilyHint);
    }

    /// <summary>
    /// The index splits names on hyphens, so <c>hi-poly</c> is stored as two words. A raw token
    /// would match nothing and look exactly like a library that happens to contain no
    /// high-poly assets.
    /// </summary>
    [Fact]
    public void HyphenatedTokens_AreNormalizedToTheShapeTheIndexStores()
    {
        var bias = ProfileSearchBiasBuilder.Build(
            ProjectWith(new[] { "Low Poly" }), AssetSearchProfileModes.Bias);

        Assert.Contains("hi poly", bias.PenaltyTokens);
        Assert.DoesNotContain("hi-poly", bias.PenaltyTokens);
    }

    [Fact]
    public void AStatedBudget_BeatsTheOneAStyleImplies()
    {
        var bias = ProfileSearchBiasBuilder.Build(
            ProjectWith(new[] { "Low Poly" }, p => GiveBudget(p, 12000)),
            AssetSearchProfileModes.Bias);

        Assert.Equal(12000, bias.TriangleCap);
        Assert.Equal("budget", bias.TriangleCapSource);
    }

    [Fact]
    public void WithNoStatedBudget_TheStylesImpliedCapIsUsedAndSaysSo()
    {
        var bias = ProfileSearchBiasBuilder.Build(
            ProjectWith(new[] { "Low Poly" }), AssetSearchProfileModes.Bias);

        Assert.Equal(5000, bias.TriangleCap);
        Assert.Equal("style", bias.TriangleCapSource);
    }

    /// <summary>
    /// The failure this guards is total: a user-added style that produced an impossible token
    /// would return an empty library for every project using it.
    /// </summary>
    [Fact]
    public void AnUnmappedStyle_ContributesItsOwnNameAndNoCap()
    {
        var bias = ProfileSearchBiasBuilder.Build(
            ProjectWith(new[] { "Vampire-Survivors-like" }), AssetSearchProfileModes.Bias);

        Assert.Equal(new[] { "vampire survivors like" }, bias.BoostTokens);
        Assert.Empty(bias.PenaltyTokens);
        Assert.Null(bias.TriangleCap);
    }

    [Fact]
    public void AProjectThatConstrainsNothing_IsInertRatherThanApplied()
    {
        var bias = ProfileSearchBiasBuilder.Build(
            ProjectWith(Array.Empty<string>()), AssetSearchProfileModes.Bias);

        Assert.True(bias.IsInert);
    }

    [Fact]
    public void EnforcingWithoutACap_IsNotEnforcement()
    {
        var bias = ProfileSearchBiasBuilder.Build(
            ProjectWith(new[] { "Cel Shaded" }), AssetSearchProfileModes.Enforce);

        // Cel Shaded implies no triangle cap, so enforce has nothing to filter on - and must
        // not invent one.
        Assert.Null(bias.TriangleCap);
        Assert.False(bias.EnforcesBudget);
    }

    [Fact]
    public void Bias_SaysTheBudgetWasReportedRatherThanApplied()
    {
        var bias = ProfileSearchBiasBuilder.Build(
            ProjectWith(new[] { "Low Poly" }, p => GiveBudget(p, 5000)),
            AssetSearchProfileModes.Bias);

        var view = ProfileSearchBiasBuilder.Describe(bias, null);

        Assert.True(view.Applied);
        Assert.Null(view.RemovedByBudget);
        Assert.Contains("not applied", view.Note);
        Assert.Contains("enforce", view.Note);
    }

    /// <summary>
    /// The number is the reason enforce is allowed to filter at all: three results with no
    /// explanation is indistinguishable from a library with three sofas in it.
    /// </summary>
    [Fact]
    public void Enforce_NamesTheCapAndHowManyAssetsItRemoved()
    {
        var bias = ProfileSearchBiasBuilder.Build(
            ProjectWith(new[] { "Low Poly" }, p => GiveBudget(p, 5000)),
            AssetSearchProfileModes.Enforce);

        var view = ProfileSearchBiasBuilder.Describe(bias, 41);

        Assert.Equal(41, view.RemovedByBudget);
        Assert.Contains("41", view.Note);
        Assert.Contains("5,000", view.Note);
        Assert.Contains("bias", view.Note);
    }

    [Fact]
    public void TokensBeyondTheRankingLimit_AreReportedRatherThanDroppedSilently()
    {
        // Three built-in styles merge past the slot limit; a caller comparing the applied list
        // against the project's styles has to be told which ones did not fit.
        var bias = ProfileSearchBiasBuilder.Build(
            ProjectWith(new[] { "Low Poly", "Voxel", "Cel Shaded" }),
            AssetSearchProfileModes.Bias);

        Assert.True(bias.BoostTokens.Count <= ProfileSearchBiasBuilder.MaxRankedTokens);
        Assert.NotEmpty(bias.DroppedTokens);
        Assert.Contains("did not fit", ProfileSearchBiasBuilder.Describe(bias, null).Note);
    }
}
