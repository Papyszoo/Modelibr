using Application.Abstractions.Repositories;
using Application.Media;
using Application.Scenes;
using Domain.Models;
using Domain.Scenes;
using Domain.ValueObjects;
using Moq;
using Xunit;

namespace Application.Tests.Scenes;

/// <summary>
/// The picture on a choice card, and the two things it must not do: invent one, or fetch one
/// per card.
///
/// The batching assertion is not decoration. A slot read is one request, and the moment this
/// resolves media per candidate a scene with a dozen proposals turns into a dozen round
/// trips that nobody notices until the library is big.
/// </summary>
public class SceneCandidateMediaProviderTests
{
    private static readonly DateTime Now = new(2026, 8, 22, 12, 0, 0, DateTimeKind.Utc);

    private readonly Mock<IModelVersionRepository> _versions = new();
    private readonly Mock<ISpriteRepository> _sprites = new();
    private readonly Mock<IEnvironmentMapRepository> _environmentMaps = new();
    private readonly Mock<IMaterialRepository> _materials = new();
    private readonly Mock<ITextureSetRepository> _textureSets = new();
    private readonly List<ModelVersion> _givenVersions = [];
    private readonly List<Material> _givenMaterials = [];
    private readonly SceneCandidateMediaProvider _provider;

    public SceneCandidateMediaProviderTests()
    {
        _versions
            .Setup(r => r.GetWithThumbnailsByIdsAsync(It.IsAny<IReadOnlyCollection<int>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((IReadOnlyCollection<int> ids, CancellationToken _) =>
                (IReadOnlyList<ModelVersion>)_givenVersions.Where(v => ids.Contains(v.Id)).ToList());
        _materials
            .Setup(r => r.GetByIdsAsync(It.IsAny<IReadOnlyCollection<int>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((IReadOnlyCollection<int> ids, CancellationToken _) =>
                (IReadOnlyList<Material>)_givenMaterials.Where(m => ids.Contains(m.Id)).ToList());

        // The real thumbnail resolver rather than a mock of it: the point of extracting it
        // was that a card and a search hit answer the same question the same way, and a
        // stubbed answer here would stop testing that.
        _provider = new SceneCandidateMediaProvider(
            new AssetThumbnailProvider(_versions.Object, _sprites.Object, _environmentMaps.Object),
            _materials.Object, _textureSets.Object);
    }

    private ModelVersion GivenVersion(int versionId, bool thumbnailReady)
    {
        var version = ModelVersion.Create(modelId: 1, versionNumber: 1, null, Now);
        SetId(version, versionId);

        var thumbnail = Thumbnail.Create(1, versionId, Now);
        if (thumbnailReady)
        {
            thumbnail.MarkAsReady("thumbs/x.webp", 100, 256, 256, Now);
        }

        version.SetThumbnail(thumbnail);
        _givenVersions.Add(version);
        return version;
    }

    private Material GivenMaterial(int id, string hex)
    {
        var material = Material.Create("Warm oak", MaterialParameters.FromHex(hex, roughness: 0.6f), Now);
        SetId(material, id);
        _givenMaterials.Add(material);
        return material;
    }

    private static void SetId(object entity, int id) =>
        entity.GetType().GetProperty("Id")!.SetValue(entity, id);

    private static SceneDocument DocumentWith(params SceneSlotCandidate[] candidates) =>
        new(SceneDocument.CurrentSchemaVersion,
            new[] { new SceneNode("node", SceneTransform.Identity, Asset: new SceneAssetRef(SceneAssetTypes.Model, 1, 7), SlotId: "streetlight") },
            Array.Empty<SceneLight>(),
            SceneEnvironment.Default,
            Slots: new[] { new SceneSlot("streetlight", candidates) });

    [Fact]
    public async Task A_Ready_Thumbnail_Becomes_An_Api_Relative_Url()
    {
        GivenVersion(7, thumbnailReady: true);
        var document = DocumentWith(new SceneSlotCandidate("A", new SceneAssetRef(SceneAssetTypes.Model, 1, 7)));

        var media = await _provider.ResolveAsync(document, CancellationToken.None);

        var entry = media["streetlight/A"];
        Assert.Equal(SceneCandidateMediaStatus.Ready, entry.AssetThumbnailStatus);
        Assert.StartsWith("/model-versions/7/thumbnail/file", entry.AssetThumbnailUrl);
        // Never a storage path: the card renders it as a src.
        Assert.DoesNotContain("thumbs/", entry.AssetThumbnailUrl);
    }

    [Fact]
    public async Task A_Thumbnail_Still_Rendering_Is_Pending_Rather_Than_Missing()
    {
        // "Come back in a moment" and "this asset will never have a picture" are different
        // answers, and a card that shows the same fallback for both is lying about one.
        GivenVersion(7, thumbnailReady: false);
        var document = DocumentWith(new SceneSlotCandidate("A", new SceneAssetRef(SceneAssetTypes.Model, 1, 7)));

        var media = await _provider.ResolveAsync(document, CancellationToken.None);

        Assert.Equal(SceneCandidateMediaStatus.Pending, media["streetlight/A"].AssetThumbnailStatus);
        Assert.Null(media["streetlight/A"].AssetThumbnailUrl);
    }

    [Fact]
    public async Task A_Parameter_Material_Becomes_A_Swatch_In_The_Colour_The_User_Picked()
    {
        // Components are stored linear; a straight float-to-byte conversion would hand the
        // card a visibly different colour. The regression this pins is a brown that arrives
        // beige.
        GivenMaterial(3, "#8B5A2B");
        var document = DocumentWith(new SceneSlotCandidate("A", Material: new SceneMaterialBinding(MaterialId: 3)));

        var media = await _provider.ResolveAsync(document, CancellationToken.None);

        var swatch = media["streetlight/A"].MaterialSwatch;
        Assert.NotNull(swatch);
        Assert.Equal("#8B5A2B", swatch!.BaseColorHex, ignoreCase: true);
        Assert.Equal(0.6, swatch.Roughness, 3);
    }

    [Fact]
    public async Task A_Store_Candidate_Carries_The_Thumbnail_Copied_Into_The_Scene()
    {
        // Copied, absolute, and not fetched: the card has to draw with the store down.
        var document = DocumentWith(new SceneSlotCandidate(
            "A",
            StoreAsset: new SceneStoreAssetRef(
                "https://store.modelibr.com", "abc", "A pack",
                "https://store.modelibr.com/api/assets/abc/previews/1")));

        var media = await _provider.ResolveAsync(document, CancellationToken.None);

        Assert.Equal(
            "https://store.modelibr.com/api/assets/abc/previews/1",
            media["streetlight/A"].StoreThumbnailUrl);
    }

    [Fact]
    public async Task Six_Model_Candidates_Are_One_Repository_Call()
    {
        for (var versionId = 7; versionId < 13; versionId++)
        {
            GivenVersion(versionId, thumbnailReady: true);
        }

        var document = DocumentWith(Enumerable.Range(7, 6)
            .Select(versionId => new SceneSlotCandidate(
                $"C{versionId}", new SceneAssetRef(SceneAssetTypes.Model, 1, versionId)))
            .ToArray());

        var media = await _provider.ResolveAsync(document, CancellationToken.None);

        Assert.Equal(6, media.Count);
        _versions.Verify(
            r => r.GetWithThumbnailsByIdsAsync(It.IsAny<IReadOnlyCollection<int>>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task A_Scene_With_No_Candidates_Reads_Nothing_At_All()
    {
        var document = new SceneDocument(
            SceneDocument.CurrentSchemaVersion,
            Array.Empty<SceneNode>(),
            Array.Empty<SceneLight>(),
            SceneEnvironment.Default);

        var media = await _provider.ResolveAsync(document, CancellationToken.None);

        Assert.Empty(media);
        _versions.VerifyNoOtherCalls();
        _materials.VerifyNoOtherCalls();
    }
}
