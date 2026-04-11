using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.EnvironmentMaps;
using Application.Tests;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Moq;
using SharedKernel;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Application.Tests.EnvironmentMaps;

public class RegenerateEnvironmentMapThumbnailCommandHandlerTests
{
    private readonly Mock<IEnvironmentMapRepository> _environmentMapRepository = new();
    private readonly Mock<IThumbnailQueue> _thumbnailQueue = new();
    private readonly Mock<IDateTimeProvider> _dateTimeProvider = new();

    [Fact]
    public async Task Handle_WhenEnvironmentMapExists_QueuesAllVariantThumbnailsAndTouchesEnvironmentMap()
    {
        var createdAt = DateTime.UtcNow.AddMinutes(-10);
        var now = DateTime.UtcNow;
        _dateTimeProvider.Setup(x => x.UtcNow).Returns(now);

        var environmentMap = EnvironmentMap.Create("Studio", createdAt).WithId(12);
        var variant = EnvironmentMapVariant.Create(CreateFile("studio.hdr", createdAt).WithId(33), "4K", createdAt).WithId(44);
        var customThumbnail = CreateImageFile("studio-thumb.png", createdAt).WithId(55);
        environmentMap.AddVariant(variant, createdAt);
        environmentMap.SetPreviewVariant(variant.Id, createdAt);
        environmentMap.SetCustomThumbnail(customThumbnail, createdAt);

        _environmentMapRepository
            .Setup(x => x.GetByIdAsync(environmentMap.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(environmentMap);

        _thumbnailQueue
            .Setup(x => x.EnqueueEnvironmentMapThumbnailAsync(environmentMap.Id, variant.Id, true, It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(ThumbnailJob.CreateForEnvironmentMap(environmentMap.Id, variant.Id, now));

        _environmentMapRepository
            .Setup(x => x.UpdateAsync(environmentMap, It.IsAny<CancellationToken>()))
            .ReturnsAsync((EnvironmentMap map, CancellationToken _) => map);

        var handler = new RegenerateEnvironmentMapThumbnailCommandHandler(
            _environmentMapRepository.Object,
            _thumbnailQueue.Object,
            _dateTimeProvider.Object);

        var result = await handler.Handle(new RegenerateEnvironmentMapThumbnailCommand(environmentMap.Id), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(environmentMap.Id, result.Value.EnvironmentMapId);
        Assert.Equal(variant.Id, result.Value.PreviewVariantId);
        Assert.Null(environmentMap.CustomThumbnailFileId);
        Assert.Equal(now, environmentMap.UpdatedAt);
        Assert.Contains(variant.Id, result.Value.RegeneratedVariantIds);
        _thumbnailQueue.Verify(x => x.EnqueueEnvironmentMapThumbnailAsync(environmentMap.Id, variant.Id, true, It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Once);
        _environmentMapRepository.Verify(x => x.UpdateAsync(environmentMap, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenEnvironmentMapDoesNotExist_ReturnsFailure()
    {
        _environmentMapRepository
            .Setup(x => x.GetByIdAsync(99, It.IsAny<CancellationToken>()))
            .ReturnsAsync((EnvironmentMap?)null);

        var handler = new RegenerateEnvironmentMapThumbnailCommandHandler(
            _environmentMapRepository.Object,
            _thumbnailQueue.Object,
            _dateTimeProvider.Object);

        var result = await handler.Handle(new RegenerateEnvironmentMapThumbnailCommand(99), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("EnvironmentMapNotFound", result.Error.Code);
    }

    private static DomainFile CreateFile(string fileName, DateTime createdAt)
    {
        return DomainFile.Create(
            fileName,
            fileName,
            $"uploads/{fileName}",
            FileType.Hdr.GetMimeType(),
            FileType.Hdr,
            1024,
            $"{Guid.NewGuid():N}{Guid.NewGuid():N}"[..64],
            createdAt);
    }

    private static DomainFile CreateImageFile(string fileName, DateTime createdAt)
    {
        return DomainFile.Create(
            fileName,
            fileName,
            $"uploads/{fileName}",
            FileType.Texture.GetMimeType(),
            FileType.Texture,
            1024,
            $"{Guid.NewGuid():N}{Guid.NewGuid():N}"[..64],
            createdAt);
    }
}
