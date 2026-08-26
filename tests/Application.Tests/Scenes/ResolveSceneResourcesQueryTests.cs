using Application.Abstractions.Repositories;
using Application.Scenes;
using Domain.Models;
using Domain.Scenes;
using Domain.ValueObjects;
using Moq;
using Xunit;

namespace Application.Tests.Scenes;

/// <summary>
/// The manifest is the boundary that prevents one scene from issuing one metadata request
/// per node. These tests pin both batching and partial failure: a stale reference must not
/// hide the valid resources beside it.
/// </summary>
public class ResolveSceneResourcesQueryTests
{
    private static readonly DateTime Now = new(2026, 8, 21, 10, 0, 0, DateTimeKind.Utc);

    private readonly Mock<IModelVersionRepository> _versions = new();
    private readonly Mock<IModelVersionAuxiliaryFileRepository> _auxiliaries = new();
    private readonly Mock<ISpriteRepository> _sprites = new();
    private readonly Mock<IEnvironmentMapRepository> _environmentMaps = new();
    private readonly ResolveSceneResourcesQueryHandler _handler;

    public ResolveSceneResourcesQueryTests()
    {
        _handler = new ResolveSceneResourcesQueryHandler(
            _versions.Object,
            _auxiliaries.Object,
            _sprites.Object,
            _environmentMaps.Object);
    }

    [Fact]
    public async Task Handle_Batches_Distinct_References_And_Keeps_Partial_Failures()
    {
        var modelFile = GivenFile(101, "room.glb", FileType.Glb, 100);
        var version = ModelVersion.Create(42, 1, null, Now);
        SetId(version, 11);
        version.AddFile(modelFile);
        version.UpdateTechnicalMetadata([], 1_250, 800, 2, 3, 2, 1, 2, 0, [], 0, Now);

        var binFile = GivenFile(102, "room.bin", FileType.Other, 25);
        var auxiliary = ModelVersionAuxiliaryFile.Create(11, binFile, "room.bin", Now);
        SetId(auxiliary, 12);
        typeof(ModelVersionAuxiliaryFile).GetProperty(nameof(ModelVersionAuxiliaryFile.FileId))!
            .SetValue(auxiliary, binFile.Id);

        var spriteFile = GivenFile(201, "icon.png", FileType.Sprite, 12);
        var sprite = Sprite.Create("Icon", spriteFile, SpriteType.Static, Now);
        SetId(sprite, 7);

        var environmentFile = GivenFile(301, "studio.hdr", FileType.Hdr, 50);
        var variant = EnvironmentMapVariant.CreatePanoramic(environmentFile, "2k", Now);
        SetId(variant, 81);
        var environmentMap = EnvironmentMap.Create("Studio", Now);
        SetId(environmentMap, 8);
        environmentMap.AddVariant(variant, Now);

        _versions
            .Setup(repository => repository.GetWithFilesByIdsAsync(
                It.IsAny<IReadOnlyCollection<int>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([version]);
        _auxiliaries
            .Setup(repository => repository.GetForVersionsAsync(
                It.IsAny<IReadOnlyCollection<int>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([auxiliary]);
        _sprites
            .Setup(repository => repository.GetByIdsAsync(
                It.IsAny<IReadOnlyCollection<int>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([sprite]);
        _environmentMaps
            .Setup(repository => repository.GetByIdsAsync(
                It.IsAny<IReadOnlyCollection<int>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([environmentMap]);

        var result = await _handler.Handle(
            new ResolveSceneResourcesQuery(
            [
                new SceneAssetRef(SceneAssetTypes.Model, 42, 11),
                new SceneAssetRef(SceneAssetTypes.Model, 42, 11),
                new SceneAssetRef(SceneAssetTypes.Model, 99, 11),
                new SceneAssetRef(SceneAssetTypes.Model, 42, 404),
                new SceneAssetRef(SceneAssetTypes.Sprite, 7),
                new SceneAssetRef(SceneAssetTypes.EnvironmentMap, 8),
                new SceneAssetRef("Sound", 5),
            ]),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(6, result.Value.Resources.Count);

        var model = Assert.Single(result.Value.Resources, resource =>
            resource.Asset == new SceneAssetRef(SceneAssetTypes.Model, 42, 11));
        Assert.True(model.Resolved);
        Assert.Equal(101, model.Original?.FileId);
        Assert.Equal("glb", model.Original?.Format);
        Assert.Equal(125, model.TotalSizeBytes);
        Assert.Equal(1_250, model.TriangleCount);
        Assert.Equal(3, model.MaterialCount);
        Assert.Equal("room.bin", Assert.Single(model.Auxiliaries).RelativePath);
        Assert.Empty(model.Previews);

        Assert.Equal(
            "SceneResources.ModelVersionMismatch",
            Assert.Single(result.Value.Resources, resource => resource.Asset.AssetId == 99).ErrorCode);
        Assert.Equal(
            "SceneResources.ModelVersionNotFound",
            Assert.Single(result.Value.Resources, resource => resource.Asset.VersionId == 404).ErrorCode);
        Assert.True(Assert.Single(
            result.Value.Resources, resource => resource.Asset.AssetType == SceneAssetTypes.Sprite).Resolved);
        Assert.Equal(301, Assert.Single(
            result.Value.Resources,
            resource => resource.Asset.AssetType == SceneAssetTypes.EnvironmentMap).Original?.FileId);
        Assert.Equal(
            "SceneResources.UnsupportedAssetType",
            Assert.Single(result.Value.Resources, resource => resource.Asset.AssetType == "Sound").ErrorCode);

        _versions.Verify(repository => repository.GetWithFilesByIdsAsync(
            It.Is<IReadOnlyCollection<int>>(ids => ids.Count == 2 && ids.Contains(11) && ids.Contains(404)),
            It.IsAny<CancellationToken>()), Times.Once);
        _auxiliaries.Verify(repository => repository.GetForVersionsAsync(
            It.Is<IReadOnlyCollection<int>>(ids => ids.Count == 1 && ids.Contains(11)),
            It.IsAny<CancellationToken>()), Times.Once);
        _sprites.Verify(repository => repository.GetByIdsAsync(
            It.Is<IReadOnlyCollection<int>>(ids => ids.Count == 1 && ids.Contains(7)),
            It.IsAny<CancellationToken>()), Times.Once);
        _environmentMaps.Verify(repository => repository.GetByIdsAsync(
            It.Is<IReadOnlyCollection<int>>(ids => ids.Count == 1 && ids.Contains(8)),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_When_Reference_Limit_Is_Exceeded_Returns_Failure_Without_Reads()
    {
        var assets = Enumerable.Range(1, 257)
            .Select(id => new SceneAssetRef(SceneAssetTypes.Sprite, id))
            .ToList();

        var result = await _handler.Handle(
            new ResolveSceneResourcesQuery(assets), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("SceneResources.TooManyAssets", result.Error.Code);
        _versions.VerifyNoOtherCalls();
        _auxiliaries.VerifyNoOtherCalls();
        _sprites.VerifyNoOtherCalls();
        _environmentMaps.VerifyNoOtherCalls();
    }

    private static Domain.Models.File GivenFile(
        int id,
        string name,
        FileType type,
        long sizeBytes)
    {
        var file = Domain.Models.File.Create(
            name,
            $"stored-{id}",
            $"models/{id}",
            "application/octet-stream",
            type,
            sizeBytes,
            id.ToString("x").PadLeft(64, '0'),
            Now);
        SetId(file, id);
        return file;
    }

    private static void SetId<T>(T entity, int id) where T : class =>
        typeof(T).GetProperty("Id")!.SetValue(entity, id);
}
