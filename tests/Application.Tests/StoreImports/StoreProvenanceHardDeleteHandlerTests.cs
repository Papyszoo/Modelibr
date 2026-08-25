using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.EnvironmentMaps;
using Application.Sounds;
using Application.Sprites;
using Application.TextureSets;
using Domain.Models;
using Domain.ValueObjects;
using Moq;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Application.Tests.StoreImports;

public sealed class StoreProvenanceHardDeleteHandlerTests
{
    private static readonly DateTime Now = new(2026, 8, 25, 0, 0, 0, DateTimeKind.Utc);

    [Fact]
    public async Task DeleteSound_WhenAssetExists_DeletesProvenanceInSameUnitOfWork()
    {
        var assets = new Mock<ISoundRepository>();
        var provenance = new Mock<IStoreImportedItemRepository>();
        var unitOfWork = new Mock<IUnitOfWork>();
        assets.Setup(r => r.GetByIdAsync(11, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Sound.Create("Sound", CreateFile("sound.wav"), 0, null, Now).WithId(11));
        var handler = new DeleteSoundCommandHandler(assets.Object, provenance.Object, unitOfWork.Object);

        var result = await handler.Handle(new DeleteSoundCommand(11), CancellationToken.None);

        Assert.True(result.IsSuccess);
        provenance.Verify(r => r.DeleteByAssetAsync("Sound", 11, It.IsAny<CancellationToken>()), Times.Once);
        assets.Verify(r => r.DeleteAsync(11, It.IsAny<CancellationToken>()), Times.Once);
        unitOfWork.Verify(r => r.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task DeleteSprite_WhenAssetExists_DeletesProvenanceInSameUnitOfWork()
    {
        var assets = new Mock<ISpriteRepository>();
        var provenance = new Mock<IStoreImportedItemRepository>();
        var unitOfWork = new Mock<IUnitOfWork>();
        assets.Setup(r => r.GetByIdAsync(12, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Sprite.Create("Sprite", CreateFile("sprite.png"), SpriteType.Static, Now).WithId(12));
        var handler = new DeleteSpriteCommandHandler(assets.Object, provenance.Object, unitOfWork.Object);

        var result = await handler.Handle(new DeleteSpriteCommand(12), CancellationToken.None);

        Assert.True(result.IsSuccess);
        provenance.Verify(r => r.DeleteByAssetAsync("Sprite", 12, It.IsAny<CancellationToken>()), Times.Once);
        assets.Verify(r => r.DeleteAsync(12, It.IsAny<CancellationToken>()), Times.Once);
        unitOfWork.Verify(r => r.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task DeleteEnvironmentMap_WhenAssetExists_DeletesProvenanceInSameUnitOfWork()
    {
        var assets = new Mock<IEnvironmentMapRepository>();
        var provenance = new Mock<IStoreImportedItemRepository>();
        var unitOfWork = new Mock<IUnitOfWork>();
        assets.Setup(r => r.GetByIdAsync(13, It.IsAny<CancellationToken>()))
            .ReturnsAsync(EnvironmentMap.Create("Sky", Now).WithId(13));
        var handler = new DeleteEnvironmentMapCommandHandler(assets.Object, provenance.Object, unitOfWork.Object);

        var result = await handler.Handle(new DeleteEnvironmentMapCommand(13), CancellationToken.None);

        Assert.True(result.IsSuccess);
        provenance.Verify(r => r.DeleteByAssetAsync("EnvironmentMap", 13, It.IsAny<CancellationToken>()), Times.Once);
        assets.Verify(r => r.DeleteAsync(13, It.IsAny<CancellationToken>()), Times.Once);
        unitOfWork.Verify(r => r.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task HardDeleteTextureSet_WhenAssetExists_DeletesProvenanceInSameUnitOfWork()
    {
        var assets = new Mock<ITextureSetRepository>();
        var provenance = new Mock<IStoreImportedItemRepository>();
        var unitOfWork = new Mock<IUnitOfWork>();
        assets.Setup(r => r.GetByIdAsync(14, It.IsAny<CancellationToken>()))
            .ReturnsAsync(TextureSet.Create("Textures", Now).WithId(14));
        var handler = new HardDeleteTextureSetCommandHandler(assets.Object, provenance.Object, unitOfWork.Object);

        var result = await handler.Handle(new HardDeleteTextureSetCommand(14), CancellationToken.None);

        Assert.True(result.IsSuccess);
        provenance.Verify(r => r.DeleteByAssetAsync("TextureSet", 14, It.IsAny<CancellationToken>()), Times.Once);
        assets.Verify(r => r.HardDeleteAsync(14, It.IsAny<CancellationToken>()), Times.Once);
        unitOfWork.Verify(r => r.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    private static DomainFile CreateFile(string name)
    {
        var hash = new string('a', 64);
        return DomainFile.Create(
            name,
            name,
            $"uploads/{name}",
            "application/octet-stream",
            FileType.Unknown,
            10,
            hash,
            Now);
    }
}
