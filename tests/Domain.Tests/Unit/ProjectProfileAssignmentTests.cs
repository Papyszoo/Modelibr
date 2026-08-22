using Domain.Models;
using Domain.Projects;
using Xunit;

namespace Domain.Tests.Unit;

/// <summary>
/// One vocabulary table for five dimensions means nothing in the schema stops a platform
/// being assigned as a style. The domain is where that is caught (prompt 13-B).
/// </summary>
public class ProjectProfileAssignmentTests
{
    private static readonly DateTime Now = new(2026, 8, 23, 0, 0, 0, DateTimeKind.Utc);

    private static readonly Dictionary<int, string> Dimensions = new()
    {
        [1] = ProjectProfileDimensions.Style,
        [2] = ProjectProfileDimensions.Style,
        [3] = ProjectProfileDimensions.Platform,
        [4] = ProjectProfileDimensions.Engine,
    };

    private static Project NewProject() => Project.Create("Nightfall", null, Now);

    [Fact]
    public void SettingOneDimension_LeavesTheOthersAlone()
    {
        var project = NewProject();

        project.SetProfileDimension(
            ProjectProfileDimensions.Style, new Dictionary<int, string?> { [1] = null }, Dimensions, Now);
        project.SetProfileDimension(
            ProjectProfileDimensions.Platform, new Dictionary<int, string?> { [3] = null }, Dimensions, Now);

        Assert.Equal(2, project.ProfileValues.Count);

        // Re-writing style must not disturb platform - the UI edits one row at a time, and a
        // wholesale write would make "I only touched Style" mean "I cleared Genre".
        project.SetProfileDimension(
            ProjectProfileDimensions.Style, new Dictionary<int, string?> { [2] = null }, Dimensions, Now);

        Assert.Equal(new[] { 2, 3 }, project.ProfileValues.Select(v => v.OptionId).OrderBy(id => id));
    }

    [Fact]
    public void AnEmptyAssignment_ClearsThatDimension()
    {
        var project = NewProject();
        project.SetProfileDimension(
            ProjectProfileDimensions.Style, new Dictionary<int, string?> { [1] = null }, Dimensions, Now);

        project.SetProfileDimension(
            ProjectProfileDimensions.Style, new Dictionary<int, string?>(), Dimensions, Now);

        Assert.Empty(project.ProfileValues);
    }

    [Fact]
    public void AnOptionFromAnotherDimension_IsRefused()
    {
        var project = NewProject();

        var ex = Assert.Throws<ArgumentException>(() => project.SetProfileDimension(
            ProjectProfileDimensions.Style, new Dictionary<int, string?> { [3] = null }, Dimensions, Now));

        Assert.Contains("platform", ex.Message);
    }

    [Fact]
    public void AnOptionThatDoesNotExist_IsRefused()
    {
        var project = NewProject();

        Assert.Throws<ArgumentException>(() => project.SetProfileDimension(
            ProjectProfileDimensions.Style, new Dictionary<int, string?> { [99] = null }, Dimensions, Now));
    }

    [Fact]
    public void RoleIsKept_OnlyWhereTheDimensionUsesIt()
    {
        var project = NewProject();

        project.SetProfileDimension(
            ProjectProfileDimensions.Engine, new Dictionary<int, string?> { [4] = "authoring" }, Dimensions, Now);
        project.SetProfileDimension(
            ProjectProfileDimensions.Style, new Dictionary<int, string?> { [1] = "authoring" }, Dimensions, Now);

        Assert.Equal("authoring", project.ProfileValues.Single(v => v.OptionId == 4).Role);
        // A role on a style means nothing; keeping it would make the field mean two things.
        Assert.Null(project.ProfileValues.Single(v => v.OptionId == 1).Role);
    }
}

public class ProjectProfileSettingsTests
{
    private static readonly DateTime Now = new(2026, 8, 23, 0, 0, 0, DateTimeKind.Utc);

    private static Project NewProject() => Project.Create("Nightfall", null, Now);

    [Fact]
    public void AnUnsetBudget_StaysNull()
    {
        var project = NewProject();

        project.SetProfileSettings(null, null, null, null, null, null, null, null, Now);

        // Null is unconstrained and must never become a default - an agent silently held to
        // a budget nobody set is worse than one held to none.
        Assert.Null(project.MaxTrianglesPerAsset);
        Assert.Null(project.UnitsPerMetre);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void ANonPositiveBudget_IsRefused(int value)
    {
        var project = NewProject();

        Assert.Throws<ArgumentException>(() =>
            project.SetProfileSettings(value, null, null, null, null, null, null, null, Now));
    }

    [Theory]
    [InlineData("y", "Y")]
    [InlineData("Z", "Z")]
    public void UpAxis_IsNormalized(string input, string expected)
    {
        var project = NewProject();

        project.SetProfileSettings(null, null, null, null, null, input, null, null, Now);

        Assert.Equal(expected, project.UpAxis);
    }

    [Fact]
    public void AnUnknownAxisOrHandedness_IsRefused()
    {
        var project = NewProject();

        Assert.Throws<ArgumentException>(() =>
            project.SetProfileSettings(null, null, null, null, null, "W", null, null, Now));
        Assert.Throws<ArgumentException>(() =>
            project.SetProfileSettings(null, null, null, null, null, null, "sideways", null, Now));
    }

    [Fact]
    public void ThePalette_IsNormalizedDeduplicatedAndCapped()
    {
        var project = NewProject();

        project.SetProfileSettings(
            null, null, null, null, null, null, null,
            new[] { "1a2b3c", "#1A2B3C", "#fff", "#111", "#222", "#333", "#444", "#555" },
            Now);

        Assert.Equal("#1A2B3C", project.PaletteHex[0]);
        Assert.Equal("#FFF", project.PaletteHex[1]);
        // Past six a palette stops saying anything about the project's identity.
        Assert.Equal(6, project.PaletteHex.Count);
    }

    [Fact]
    public void ANonColour_IsRefusedRatherThanDropped()
    {
        var project = NewProject();

        Assert.Throws<ArgumentException>(() => project.SetProfileSettings(
            null, null, null, null, null, null, null, new[] { "cornflower" }, Now));
    }
}
