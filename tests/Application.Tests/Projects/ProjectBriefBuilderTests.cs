using Application.Projects.Profile;
using Domain.Models;
using Domain.Projects;
using Xunit;

namespace Application.Tests.Projects;

/// <summary>
/// The brief is what an agent is told, so what it says is the feature. These pin the parts a
/// reader would otherwise have to trust: that an unset budget is not quietly filled in, that
/// disagreeing engines are reported rather than resolved, and that guidance says what it
/// cannot check.
/// </summary>
public class ProjectBriefBuilderTests
{
    private static readonly DateTime Now = new(2026, 8, 23, 0, 0, 0, DateTimeKind.Utc);

    private static int _nextOptionId = 1;

    private static Project ProjectWith(
        (string Dimension, string Name, string? Role)[] profile,
        Action<Project>? configure = null)
    {
        var project = Project.Create("Nightfall", "A small horror game.", Now);

        var options = profile
            .Select(p =>
            {
                var option = ProjectProfileOption.Create(p.Dimension, p.Name, Now, isBuiltIn: true);
                SetId(option, _nextOptionId++);
                return (Option: option, p.Role);
            })
            .ToList();

        var dimensions = options.ToDictionary(o => o.Option.Id, o => o.Option.Dimension);

        foreach (var group in options.GroupBy(o => o.Option.Dimension))
        {
            project.SetProfileDimension(
                group.Key,
                group.ToDictionary(o => o.Option.Id, o => o.Role),
                dimensions,
                Now);
        }

        // The domain stores ids; the brief reports names, so the loaded navigation has to be
        // stitched back the way EF would.
        foreach (var value in project.ProfileValues)
        {
            SetOption(value, options.Single(o => o.Option.Id == value.OptionId).Option);
        }

        configure?.Invoke(project);
        return project;
    }

    private static void SetId(ProjectProfileOption option, int id) =>
        typeof(ProjectProfileOption).GetProperty("Id")!.SetValue(option, id);

    private static void SetOption(ProjectProfileValue value, ProjectProfileOption option) =>
        typeof(ProjectProfileValue).GetProperty("Option")!.SetValue(value, option);

    [Fact]
    public void TheBrief_GroupsProfileValuesByDimension()
    {
        var project = ProjectWith(new[]
        {
            ("engine", "Blender", (string?)"authoring"),
            ("engine", "Unity", "runtime"),
            ("style", "Low Poly", null),
            ("platform", "Meta Quest", null),
        });

        var brief = ProjectBriefBuilder.Build(project);

        Assert.Equal(2, brief.Engines.Count);
        Assert.Equal("authoring", brief.Engines.Single(e => e.Name == "Blender").Role);
        Assert.Equal(new[] { "Low Poly" }, brief.Styles.Select(s => s.Name));
        Assert.Empty(brief.Genres);
    }

    /// <summary>
    /// A suggestion is offered; it is never silently stored or reported as the budget. An
    /// agent held to a cap nobody set is worse than one held to none.
    /// </summary>
    [Fact]
    public void AnUnsetBudget_StaysUnsetEvenWhenThePlatformSuggestsOne()
    {
        var project = ProjectWith(new[] { ("platform", "Meta Quest", (string?)null) });

        var brief = ProjectBriefBuilder.Build(project);

        Assert.Null(brief.Budget.MaxTrianglesPerAsset);
        Assert.NotNull(brief.BudgetSuggestion);
        Assert.Equal(5_000, brief.BudgetSuggestion!.MaxTrianglesPerAsset);
        Assert.Contains("Meta Quest", brief.BudgetSuggestion.Note);
    }

    [Fact]
    public void AnAcceptedBudget_IsWhatTheGuidanceStates()
    {
        var project = ProjectWith(
            new[] { ("platform", "Meta Quest", (string?)null) },
            p => p.SetProfileSettings(5_000, 1024, null, null, null, null, null, null, Now));

        var brief = ProjectBriefBuilder.Build(project);

        Assert.Equal(5_000, brief.Budget.MaxTrianglesPerAsset);
        Assert.Contains(brief.Guidance, g => g.Contains("5,000 triangles"));
    }

    [Fact]
    public void DisagreeingEngines_AreReportedRatherThanResolved()
    {
        var project = ProjectWith(new[]
        {
            ("engine", "Blender", (string?)"authoring"),
            ("engine", "Unity", "runtime"),
        });

        var brief = ProjectBriefBuilder.Build(project);

        Assert.NotEmpty(brief.WorldConvention.Conflicts);
        Assert.Contains(brief.Guidance, g => g.Contains("disagree"));
        // And the conversions are still stated, per engine.
        Assert.Contains(brief.WorldConvention.EngineConversions, c => c.StartsWith("Unity:"));
    }

    [Fact]
    public void TheWorldConvention_DefaultsToModelibrsOwnAndSaysSo()
    {
        var project = ProjectWith(Array.Empty<(string, string, string?)>());

        var brief = ProjectBriefBuilder.Build(project);

        Assert.True(brief.WorldConvention.IsDefault);
        Assert.Equal(1.0, brief.WorldConvention.UnitsPerMetre);
        Assert.Equal("Y", brief.WorldConvention.UpAxis);
    }

    [Fact]
    public void AStyleWithNoReading_IsNamedRatherThanHidden()
    {
        var project = ProjectWith(new[] { ("style", "Vampire-Survivors-like", (string?)null) });

        var brief = ProjectBriefBuilder.Build(project);

        Assert.Equal(new[] { "Vampire-Survivors-like" }, brief.StyleSignals.UnmappedStyles);
        Assert.Contains(brief.Guidance, g => g.Contains("No built-in reading"));
    }

    [Fact]
    public void PixelArt_TellsTheAgentToSearchSprites()
    {
        var project = ProjectWith(new[] { ("style", "Pixel Art", (string?)null) });

        var brief = ProjectBriefBuilder.Build(project);

        Assert.Equal("Sprite", brief.StyleSignals.FamilyHint);
        Assert.Contains(brief.Guidance, g => g.Contains("Sprite assets"));
    }

    /// <summary>
    /// Pixels per unit has no producer - nothing extracts a sprite's pixel size - so the
    /// brief has to say the check does not run rather than imply one that does.
    /// </summary>
    [Fact]
    public void PixelsPerUnit_SaysItCannotBeChecked()
    {
        var project = ProjectWith(
            new[] { ("style", "Pixel Art", (string?)null) },
            p => p.SetProfileSettings(null, null, null, 32, null, null, null, null, Now));

        var brief = ProjectBriefBuilder.Build(project);

        Assert.Contains(brief.Guidance, g => g.Contains("cannot be checked automatically"));
    }

    [Fact]
    public void AnEmptyProfile_ProducesAnEmptyBriefRatherThanInventedConstraints()
    {
        var project = ProjectWith(Array.Empty<(string, string, string?)>());

        var brief = ProjectBriefBuilder.Build(project);

        Assert.Empty(brief.Guidance);
        Assert.Null(brief.BudgetSuggestion);
        Assert.Null(brief.StyleSignals.MaxTriangles);
    }
}
