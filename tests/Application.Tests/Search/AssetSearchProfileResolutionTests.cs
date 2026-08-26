using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Media;
using Application.Search;
using Domain.Models;
using Domain.Projects;
using Domain.Services;
using Moq;
using Xunit;

namespace Application.Tests.Search;

/// <summary>
/// How <c>search_assets</c> decides which project it is searching for, and how much of that
/// project's profile it applies (prompt 13-D3).
///
/// <para>
/// The behaviour under test is mostly about what does <b>not</b> happen quietly: a mistyped
/// mode does not fall back to the default, an unlinked scene does not fail, and a search that
/// mentions no project is untouched.
/// </para>
/// </summary>
public class AssetSearchProfileResolutionTests
{
    private static readonly DateTime Now = new(2026, 8, 23, 0, 0, 0, DateTimeKind.Utc);

    private static int _nextOptionId = 1000;

    private readonly Mock<ISearchRepository> _search = new();
    private readonly Mock<IProjectRepository> _projects = new();
    private readonly Mock<ISceneRepository> _scenes = new();
    private readonly AssetSearchQueryHandler _handler;

    private AssetSearchRequest? _captured;

    private readonly Mock<IAssetThumbnails> _thumbnails = new();

    public AssetSearchProfileResolutionTests()
    {
        _thumbnails
            .Setup(t => t.ResolveAsync(It.IsAny<IEnumerable<AssetThumbnailRef>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, AssetThumbnail>(StringComparer.Ordinal));

        _search
            .Setup(r => r.SearchAssetsAsync(It.IsAny<AssetSearchRequest>(), It.IsAny<CancellationToken>()))
            .Callback<AssetSearchRequest, CancellationToken>((r, _) => _captured = r)
            .ReturnsAsync(() => new AssetSearchResponse(
                Array.Empty<AssetSearchHit>(),
                0,
                _captured!.Profile is null ? null : ProfileSearchBiasBuilder.Describe(_captured.Profile, null)));

        // These searches return nothing, which is thin enough for the response to explain
        // itself. That path is covered by AssetSearchQueryExplanationTests; here it just
        // needs to answer.
        _search
            .Setup(r => r.ExplainTermsAsync(
                It.IsAny<IReadOnlyList<SearchQueryParser.QueryTerm>>(),
                It.IsAny<string?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<SearchTermDiagnostic>());

        var clock = new Mock<IDateTimeProvider>();
        clock.SetupGet(c => c.UtcNow).Returns(Now);

        _handler = new AssetSearchQueryHandler(
            _search.Object,
            new Mock<ISearchLogRepository>().Object,
            clock.Object,
            new Mock<IUnitOfWork>().Object,
            _projects.Object,
            _scenes.Object,
            _thumbnails.Object);
    }

    private void GivenProject(int id, string name, string? style = "Low Poly", int? budget = null)
    {
        var project = Project.Create(name, null, Now);
        typeof(Project).GetProperty("Id")!.SetValue(project, id);

        if (style is not null)
        {
            var option = ProjectProfileOption.Create(ProjectProfileDimensions.Style, style, Now, isBuiltIn: true);
            typeof(ProjectProfileOption).GetProperty("Id")!.SetValue(option, _nextOptionId++);
            project.SetProfileDimension(
                ProjectProfileDimensions.Style,
                new Dictionary<int, string?> { [option.Id] = null },
                new Dictionary<int, string> { [option.Id] = option.Dimension },
                Now);
            typeof(ProjectProfileValue).GetProperty("Option")!.SetValue(project.ProfileValues.Single(), option);
        }

        if (budget is int cap)
        {
            project.SetProfileSettings(cap, null, null, null, null, null, null, null, Now);
        }

        _projects.Setup(r => r.GetByIdAsync(id, It.IsAny<CancellationToken>())).ReturnsAsync(project);
    }

    private void GivenScene(int id, int? projectId)
    {
        var scene = Scene.Create("Living Room", "{\"schemaVersion\":1}", 1, Now, projectId: projectId).Value;
        _scenes.Setup(r => r.GetByIdAsync(id, It.IsAny<CancellationToken>())).ReturnsAsync(scene);
    }

    [Fact]
    public async Task ASearchThatMentionsNoProject_IsUntouched()
    {
        var result = await _handler.Handle(new AssetSearchQuery("chair"), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Null(_captured!.Profile);
        Assert.Null(result.Value.Profile);
    }

    [Fact]
    public async Task AProjectId_ResolvesToItsStyleAndBiasesByDefault()
    {
        GivenProject(7, "Nightfall", budget: 5000);

        var result = await _handler.Handle(
            new AssetSearchQuery("chair", ProjectId: 7), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(AssetSearchProfileModes.Bias, _captured!.Profile!.Mode);
        Assert.Equal(5000, _captured.Profile.TriangleCap);
        // bias reports the cap; it must not become a filter without being asked.
        Assert.False(_captured.Profile.EnforcesBudget);
        Assert.True(result.Value.Profile!.Applied);
    }

    [Fact]
    public async Task Enforce_MakesTheBudgetAFilter()
    {
        GivenProject(7, "Nightfall", budget: 5000);

        await _handler.Handle(
            new AssetSearchQuery("chair", ProjectId: 7, ApplyProfile: "enforce"), CancellationToken.None);

        Assert.True(_captured!.Profile!.EnforcesBudget);
    }

    /// <summary>
    /// A caller that typed "enforced" and silently got "bias" would read a budget as applied
    /// when it was only reported - the one misreading this parameter exists to prevent.
    /// </summary>
    [Fact]
    public async Task AnUnrecognisedMode_FailsRatherThanFallingBackToTheDefault()
    {
        GivenProject(7, "Nightfall");

        var result = await _handler.Handle(
            new AssetSearchQuery("chair", ProjectId: 7, ApplyProfile: "enforced"), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("search.invalid_apply_profile", result.Error.Code);
        _search.Verify(r => r.SearchAssetsAsync(It.IsAny<AssetSearchRequest>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ASceneId_ResolvesToItsProjectsProfile()
    {
        GivenScene(3, projectId: 7);
        GivenProject(7, "Nightfall", budget: 5000);

        await _handler.Handle(new AssetSearchQuery("chair", SceneId: 3), CancellationToken.None);

        Assert.Equal(7, _captured!.Profile!.ProjectId);
    }

    /// <summary>
    /// Belonging to no project is the normal state of most scenes. The answer is the unbiased
    /// library and a line saying so - not a refusal, and not silence.
    /// </summary>
    [Fact]
    public async Task ASceneInNoProject_SearchesUnbiasedAndSaysWhy()
    {
        GivenScene(3, projectId: null);

        var result = await _handler.Handle(new AssetSearchQuery("chair", SceneId: 3), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Null(_captured!.Profile);
        Assert.False(result.Value.Profile!.Applied);
        Assert.Contains("belongs to no project", result.Value.Profile.Note);
    }

    [Fact]
    public async Task Off_ResolvesTheProjectAndThenAppliesNothing()
    {
        GivenProject(7, "Nightfall", budget: 5000);

        var result = await _handler.Handle(
            new AssetSearchQuery("chair", ProjectId: 7, ApplyProfile: "off"), CancellationToken.None);

        Assert.Null(_captured!.Profile);
        Assert.False(result.Value.Profile!.Applied);
        Assert.Equal(7, result.Value.Profile.ProjectId);
    }

    [Fact]
    public async Task AProjectThatDoesNotExist_IsAnError()
    {
        var result = await _handler.Handle(
            new AssetSearchQuery("chair", ProjectId: 404), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("project.not_found", result.Error.Code);
    }

    /// <summary>
    /// A project with no style and no budget cannot change an ordering. Running the ranking
    /// for it would cost a scan and say nothing, so it is reported instead of applied.
    /// </summary>
    [Fact]
    public async Task AProjectWithNothingToSayAboutStyleOrBudget_IsReportedNotApplied()
    {
        GivenProject(7, "Nightfall", style: null);

        var result = await _handler.Handle(
            new AssetSearchQuery("chair", ProjectId: 7), CancellationToken.None);

        Assert.Null(_captured!.Profile);
        Assert.False(result.Value.Profile!.Applied);
    }
}
