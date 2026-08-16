using Application.Abstractions.Repositories;
using Application.Extraction;
using Application.Scenes;
using Domain.Models;
using Domain.Scenes;
using Moq;
using Xunit;

namespace Application.Tests.Scenes;

/// <summary>
/// The facts a scene node is placed against, and whether its reference names anything at
/// all.
///
/// Two failure modes are covered. A version-pinned node must get <i>its</i> version's
/// placement metadata: reading the newest derivation meant uploading a new version of a
/// model silently changed how an old scene grounded and snapped it - the re-pointing that
/// pinning exists to prevent. And a reference to nothing must be distinguishable from an
/// asset that simply has no derived bounds yet, or a typo'd id produces a document the
/// editor can never load with nothing anywhere saying why.
/// </summary>
public class SceneAssetFactsProviderTests
{
    private static readonly DateTime Now = new(2026, 8, 16, 12, 0, 0, DateTimeKind.Utc);

    private readonly Mock<IModelVersionRepository> _versions = new();
    private readonly Mock<ISpriteRepository> _sprites = new();
    private readonly Mock<IEnvironmentMapRepository> _environmentMaps = new();
    private readonly Mock<IAssetDerivationRepository> _derivations = new();
    private readonly SceneAssetFactsProvider _provider;

    public SceneAssetFactsProviderTests()
    {
        _provider = new SceneAssetFactsProvider(
            _versions.Object, _sprites.Object, _environmentMaps.Object, _derivations.Object);
    }

    private ModelVersion GivenVersion(int versionId, int modelId)
    {
        var version = ModelVersion.Create(modelId, 1, null, Now);
        typeof(ModelVersion).GetProperty(nameof(ModelVersion.Id))!.SetValue(version, versionId);
        _versions.Setup(r => r.GetByIdAsync(versionId, It.IsAny<CancellationToken>())).ReturnsAsync(version);
        return version;
    }

    private static string PlacementPayload(string originConvention, double gridSize) =>
        $$"""{"OriginConvention":"{{originConvention}}","GridSize":{{gridSize}}}""";

    [Fact]
    public async Task ResolveAsync_Reads_The_Pinned_Versions_Derivation_Not_The_Newest_One()
    {
        GivenVersion(versionId: 1, modelId: 42);

        _derivations
            .Setup(r => r.GetByKeyAsync(ExtractionAssetTypes.Model, 42, 1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(AssetDerivation.Create(
                ExtractionAssetTypes.Model, 42, 1, 1, PlacementPayload("bottom-center", 1), Now));

        // What version 2 later derived. A node pinned to version 1 must not see it.
        _derivations
            .Setup(r => r.GetLatestForAssetAsync(ExtractionAssetTypes.Model, 42, It.IsAny<CancellationToken>()))
            .ReturnsAsync(AssetDerivation.Create(
                ExtractionAssetTypes.Model, 42, 2, 1, PlacementPayload("centered", 4), Now));

        var facts = await _provider.ResolveAsync([new SceneAssetRef(SceneAssetTypes.Model, 42, 1)]);

        var resolved = Assert.Single(facts).Value;
        Assert.Equal("bottom-center", resolved.OriginConvention);
        Assert.Equal(1, resolved.GridSize);
    }

    [Fact]
    public async Task ResolveAsync_Falls_Back_To_The_Latest_Derivation_When_The_Pinned_Version_Has_None()
    {
        GivenVersion(versionId: 1, modelId: 42);

        _derivations
            .Setup(r => r.GetByKeyAsync(ExtractionAssetTypes.Model, 42, 1, It.IsAny<CancellationToken>()))
            .ReturnsAsync((AssetDerivation?)null);
        _derivations
            .Setup(r => r.GetLatestForAssetAsync(ExtractionAssetTypes.Model, 42, It.IsAny<CancellationToken>()))
            .ReturnsAsync(AssetDerivation.Create(
                ExtractionAssetTypes.Model, 42, 2, 1, PlacementPayload("centered", 4), Now));

        var facts = await _provider.ResolveAsync([new SceneAssetRef(SceneAssetTypes.Model, 42, 1)]);

        Assert.Equal("centered", Assert.Single(facts).Value.OriginConvention);
    }

    [Fact]
    public async Task ResolveAsync_Reads_The_Measured_Origin_Off_The_Derivation()
    {
        GivenVersion(versionId: 1, modelId: 42);

        _derivations
            .Setup(r => r.GetByKeyAsync(ExtractionAssetTypes.Model, 42, 1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(AssetDerivation.Create(
                ExtractionAssetTypes.Model, 42, 1, 2,
                """{"OriginConvention":"bottom-center","OriginInBounds":[0.5,0.0,0.5],"GridSize":1}""",
                Now));

        var facts = await _provider.ResolveAsync([new SceneAssetRef(SceneAssetTypes.Model, 42, 1)]);

        Assert.Equal(new Vec3(0.5, 0, 0.5), Assert.Single(facts).Value.OriginInBounds);
    }

    [Fact]
    public async Task ResolveAsync_When_The_Derivation_Predates_The_Measurement_Reports_No_Origin()
    {
        // A pre-v2 payload has no measured origin, and none is invented for it. Rebuilding
        // one from the stored part world boxes was tried and reverted: for a library
        // extracted before `7f0c7c77` those boxes are the post-normalizeModel thumbnail
        // framing, so the rebuild returned "centred" for 1725 of 1762 assets and silently
        // reproduced the bug this field exists to fix. Absent beats confidently wrong -
        // placement falls through to the label, and a re-extraction is the real repair.
        GivenVersion(versionId: 1, modelId: 42);

        _derivations
            .Setup(r => r.GetByKeyAsync(ExtractionAssetTypes.Model, 42, 1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(AssetDerivation.Create(
                ExtractionAssetTypes.Model, 42, 1, 1, PlacementPayload("centered", 1), Now));

        var facts = await _provider.ResolveAsync([new SceneAssetRef(SceneAssetTypes.Model, 42, 1)]);

        Assert.Null(Assert.Single(facts).Value.OriginInBounds);
    }

    [Fact]
    public async Task FindUnresolvableAsync_Reports_A_Version_That_Belongs_To_Another_Model()
    {
        GivenVersion(versionId: 1, modelId: 99);

        var problems = await _provider.FindUnresolvableAsync([new SceneAssetRef(SceneAssetTypes.Model, 42, 1)]);

        Assert.Contains("belongs to model 99", Assert.Single(problems).Reason);
    }

    [Fact]
    public async Task FindUnresolvableAsync_Reports_A_Sprite_That_Does_Not_Exist()
    {
        _sprites.Setup(r => r.GetByIdAsync(7, It.IsAny<CancellationToken>())).ReturnsAsync((Sprite?)null);

        var problems = await _provider.FindUnresolvableAsync([new SceneAssetRef(SceneAssetTypes.Sprite, 7)]);

        Assert.Contains("no sprite with id 7", Assert.Single(problems).Reason);
    }

    [Fact]
    public async Task FindUnresolvableAsync_Accepts_A_Reference_That_Exists_But_Has_No_Derived_Facts()
    {
        // "No bounds yet" is normal and must place anyway; only "no such asset" is a problem.
        GivenVersion(versionId: 1, modelId: 42);

        var problems = await _provider.FindUnresolvableAsync([new SceneAssetRef(SceneAssetTypes.Model, 42, 1)]);

        Assert.Empty(problems);
    }

    [Fact]
    public async Task FindUnresolvableAsync_Reports_A_Model_Node_With_No_Pinned_Version()
    {
        var problems = await _provider.FindUnresolvableAsync([new SceneAssetRef(SceneAssetTypes.Model, 42)]);

        Assert.Contains("must pin a versionId", Assert.Single(problems).Reason);
    }
}
