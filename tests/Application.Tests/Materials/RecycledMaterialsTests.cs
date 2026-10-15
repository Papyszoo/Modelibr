using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Abstractions.Storage;
using Application.RecycledFiles;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Moq;
using Xunit;

namespace Application.Tests.Materials;

/// <summary>
/// Deleted materials are recycled like every other asset: they appear in the bin, can be
/// restored, and can be permanently deleted. Before this, DELETE /materials/{id} soft-deleted
/// and the material was then unreachable from the recycle bin - the row survived but nothing
/// could bring it back or finish it off.
/// </summary>
public class RecycledMaterialsTests
{
    private static readonly DateTime Now = new(2026, 10, 1, 12, 0, 0, DateTimeKind.Utc);

    private readonly Mock<IModelRepository> _models = new();
    private readonly Mock<IModelVersionRepository> _versions = new();
    private readonly Mock<IFileRepository> _files = new();
    private readonly Mock<ITextureSetRepository> _textureSets = new();
    private readonly Mock<ISpriteRepository> _sprites = new();
    private readonly Mock<ISoundRepository> _sounds = new();
    private readonly Mock<IScriptRepository> _scripts = new();
    private readonly Mock<IEnvironmentMapRepository> _environmentMaps = new();
    private readonly Mock<IMaterialRepository> _materials = new();
    private readonly Mock<IAssetSearchDocumentRepository> _searchDocuments = new();
    private readonly Mock<IFileStorage> _fileStorage = new();
    private readonly Mock<IThumbnailQueue> _thumbnailQueue = new();
    private readonly Mock<IStoreImportedItemRepository> _storeItems = new();
    private readonly Mock<IUnitOfWork> _unitOfWork = new();

    private static Material DeletedMaterial(string name = "Brass", string? thumbnail = "/uploads/materials/1.webp")
    {
        var material = Material.Create(name, MaterialParameters.Default, Now);
        typeof(Material).GetProperty(nameof(Material.Id))!.SetValue(material, 7);
        material.SetThumbnailPaths(thumbnail, null, Now);
        material.SoftDelete(Now);
        return material;
    }

    private IDateTimeProvider Clock()
    {
        var clock = new Mock<IDateTimeProvider>();
        clock.SetupGet(c => c.UtcNow).Returns(Now);
        return clock.Object;
    }

    private GetAllRecycledQueryHandler ListHandler() => new(
        _models.Object, _versions.Object, _files.Object, _textureSets.Object,
        _sprites.Object, _sounds.Object, _scripts.Object, _environmentMaps.Object, _materials.Object);

    private GetDeletePreviewQueryHandler PreviewHandler() => new(
        _models.Object, _versions.Object, _files.Object, _textureSets.Object,
        _sprites.Object, _sounds.Object, _scripts.Object, _environmentMaps.Object, _materials.Object);

    private PermanentDeleteEntityCommandHandler PermanentHandler() => new(
        _models.Object, _versions.Object, _files.Object, _textureSets.Object,
        _sprites.Object, _sounds.Object, _scripts.Object, _environmentMaps.Object, _materials.Object,
        _fileStorage.Object, _thumbnailQueue.Object, _searchDocuments.Object, _storeItems.Object, _unitOfWork.Object);

    private RestoreEntityCommandHandler RestoreHandler() => new(
        _models.Object, _versions.Object, _files.Object, _textureSets.Object,
        _sprites.Object, _sounds.Object, _scripts.Object, _environmentMaps.Object, _materials.Object,
        _searchDocuments.Object, Clock(), _unitOfWork.Object);

    [Fact]
    public async Task Recycled_List_Includes_Deleted_Materials()
    {
        GivenNothingElseRecycled();
        _materials.Setup(r => r.GetAllDeletedAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { DeletedMaterial() });

        var result = await ListHandler().Handle(new GetAllRecycledQuery(), CancellationToken.None);

        var material = Assert.Single(result.Value.Materials);
        Assert.Equal(7, material.Id);
        Assert.Equal("Brass", material.Name);
        Assert.Equal(Now, material.DeletedAt);
    }

    private void GivenNothingElseRecycled()
    {
        _models.Setup(r => r.GetAllDeletedAsync(It.IsAny<CancellationToken>())).ReturnsAsync(Array.Empty<Model>());
        _versions.Setup(r => r.GetAllDeletedAsync(It.IsAny<CancellationToken>())).ReturnsAsync(Array.Empty<ModelVersion>());
        _files.Setup(r => r.GetAllDeletedAsync(It.IsAny<CancellationToken>())).ReturnsAsync(Array.Empty<Domain.Models.File>());
        _textureSets.Setup(r => r.GetAllDeletedAsync(It.IsAny<CancellationToken>())).ReturnsAsync(Array.Empty<TextureSet>());
        _sprites.Setup(r => r.GetAllDeletedAsync(It.IsAny<CancellationToken>())).ReturnsAsync(Array.Empty<Sprite>());
        _sounds.Setup(r => r.GetAllDeletedAsync(It.IsAny<CancellationToken>())).ReturnsAsync(Array.Empty<Sound>());
        _scripts.Setup(r => r.GetAllDeletedAsync(It.IsAny<CancellationToken>())).ReturnsAsync(Array.Empty<Script>());
        _environmentMaps.Setup(r => r.GetAllDeletedAsync(It.IsAny<CancellationToken>())).ReturnsAsync(Array.Empty<EnvironmentMap>());
        _environmentMaps.Setup(r => r.GetAllWithDeletedVariantsAsync(It.IsAny<CancellationToken>())).ReturnsAsync(Array.Empty<EnvironmentMap>());
    }

    [Fact]
    public async Task Delete_Preview_Names_The_Material_And_Its_Thumbnail()
    {
        _materials.Setup(r => r.GetDeletedByIdAsync(7, It.IsAny<CancellationToken>()))
            .ReturnsAsync(DeletedMaterial());

        var result = await PreviewHandler().Handle(new GetDeletePreviewQuery("material", 7), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Brass", result.Value.EntityName);
        Assert.Contains(result.Value.FilesToDelete, f => f.FilePath == "/uploads/materials/1.webp");
    }

    [Fact]
    public async Task Permanent_Delete_Removes_The_Material_And_Its_Thumbnail()
    {
        _materials.Setup(r => r.GetDeletedByIdAsync(7, It.IsAny<CancellationToken>()))
            .ReturnsAsync(DeletedMaterial());

        var result = await PermanentHandler().Handle(
            new PermanentDeleteEntityCommand("material", 7), CancellationToken.None);

        Assert.True(result.IsSuccess);
        _fileStorage.Verify(s => s.DeleteFileAsync("/uploads/materials/1.webp", It.IsAny<CancellationToken>()), Times.Once);
        _materials.Verify(r => r.DeleteAsync(7, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Restore_Brings_A_Recycled_Material_Back()
    {
        var material = DeletedMaterial();
        _materials.Setup(r => r.GetDeletedByIdAsync(7, It.IsAny<CancellationToken>()))
            .ReturnsAsync(material);

        var result = await RestoreHandler().Handle(new RestoreEntityCommand("material", 7), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.False(material.IsDeleted);
        _materials.Verify(r => r.UpdateAsync(material, It.IsAny<CancellationToken>()), Times.Once);
    }
}
