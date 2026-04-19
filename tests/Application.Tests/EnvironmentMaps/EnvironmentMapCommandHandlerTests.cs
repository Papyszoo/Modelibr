using Application.Abstractions.Files;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Tests;
using Application.EnvironmentMaps;
using Application.Services;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Moq;
using SharedKernel;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Application.Tests.EnvironmentMaps;

public class EnvironmentMapCommandHandlerTests
{
    private readonly Mock<IEnvironmentMapRepository> _environmentMapRepository = new();
    private readonly Mock<IBatchUploadRepository> _batchUploadRepository = new();
    private readonly Mock<IFileCreationService> _fileCreationService = new();
    private readonly Mock<IEnvironmentMapSizeLabelService> _sizeLabelService = new();
    private readonly Mock<ISettingRepository> _settingRepository = new();
    private readonly Mock<IThumbnailQueue> _thumbnailQueue = new();
    private readonly Mock<IDateTimeProvider> _dateTimeProvider = new();

    [Fact]
    public async Task CreateWithFile_WhenMatchingFileAlreadyExists_ReturnsExistingEnvironmentMapAndLogsBatch()
    {
        var now = DateTime.UtcNow;
        _dateTimeProvider.Setup(x => x.UtcNow).Returns(now);

        var fileUpload = CreateFileUpload("studio.hdr");
        var file = CreateEnvironmentMapFile("studio.hdr", now).WithId(7);

        var existingEnvironmentMap = EnvironmentMap.Create("Studio", now).WithId(11);
        var existingVariant = EnvironmentMapVariant.Create(file, "4K", now).WithId(15);
        existingEnvironmentMap.AddVariant(existingVariant, now);
        existingEnvironmentMap.SetPreviewVariant(existingVariant.Id, now);

        _fileCreationService
            .Setup(x => x.CreateOrGetExistingFileAsync(fileUpload, It.IsAny<FileType>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(file));

        _environmentMapRepository
            .Setup(x => x.GetByFileHashAsync(file.Sha256Hash, It.IsAny<CancellationToken>()))
            .ReturnsAsync(existingEnvironmentMap);

        var handler = new CreateEnvironmentMapWithFileCommandHandler(
            _environmentMapRepository.Object,
            _batchUploadRepository.Object,
            _fileCreationService.Object,
            _sizeLabelService.Object,
            _settingRepository.Object,
            _thumbnailQueue.Object,
            _dateTimeProvider.Object);

        var command = new CreateEnvironmentMapWithFileCommand(fileUpload, null, "Studio", "4K", "batch-1", 3, null);

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(existingEnvironmentMap.Id, result.Value.EnvironmentMapId);
        Assert.Equal(existingVariant.Id, result.Value.VariantId);
        Assert.Equal(existingEnvironmentMap.PreviewVariantId, result.Value.PreviewVariantId);
        _environmentMapRepository.Verify(x => x.AddAsync(It.IsAny<EnvironmentMap>(), It.IsAny<CancellationToken>()), Times.Never);
        _batchUploadRepository.Verify(x => x.AddRangeAsync(
            It.Is<IEnumerable<BatchUpload>>(uploads => uploads.Single().BatchId == "batch-1"
                && uploads.Single().UploadType == "environmentmap"
                && uploads.Single().FileId == file.Id
                && uploads.Single().EnvironmentMapId == existingEnvironmentMap.Id
                && uploads.Single().PackId == 3),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task AddVariantWithFile_WhenEnvironmentMapHasNoPreview_SetsPreviewAndPersistsTwice()
    {
        var now = DateTime.UtcNow;
        _dateTimeProvider.Setup(x => x.UtcNow).Returns(now);

        var environmentMap = EnvironmentMap.Create("Sunset", now).WithId(21);
        var fileUpload = CreateFileUpload("sunset.hdr");
        var file = CreateEnvironmentMapFile("sunset.hdr", now).WithId(31);

        _environmentMapRepository
            .Setup(x => x.GetByIdAsync(environmentMap.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(environmentMap);

        _fileCreationService
            .Setup(x => x.CreateOrGetExistingFileAsync(fileUpload, It.IsAny<FileType>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(file));

        _thumbnailQueue
            .Setup(x => x.EnqueueEnvironmentMapThumbnailAsync(environmentMap.Id, It.IsAny<int>(), true, It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(ThumbnailJob.CreateForEnvironmentMap(environmentMap.Id, 44, now));

        _environmentMapRepository
            .Setup(x => x.UpdateAsync(environmentMap, It.IsAny<CancellationToken>()))
            .ReturnsAsync((EnvironmentMap map, CancellationToken _) =>
            {
                var variant = map.Variants.Single();
                if (variant.Id == 0)
                    variant.WithId(44);

                return map;
            });

        var handler = new AddEnvironmentMapVariantWithFileCommandHandler(
            _environmentMapRepository.Object,
            _fileCreationService.Object,
            _sizeLabelService.Object,
            _thumbnailQueue.Object,
            _dateTimeProvider.Object);

        var command = new AddEnvironmentMapVariantWithFileCommand(environmentMap.Id, fileUpload, null, "8K");

        var result = await handler.Handle(command, CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(44, result.Value.VariantId);
        Assert.Equal(file.Id, result.Value.FileId);
        Assert.Equal(44, environmentMap.PreviewVariantId);
        _environmentMapRepository.Verify(x => x.UpdateAsync(environmentMap, It.IsAny<CancellationToken>()), Times.Exactly(2));
    }

    [Fact]
    public async Task AddVariantWithFile_WhenSizeLabelMissing_InfersFromFileDimensions()
    {
        var now = DateTime.UtcNow;
        _dateTimeProvider.Setup(x => x.UtcNow).Returns(now);

        var environmentMap = EnvironmentMap.Create("Sky", now).WithId(77);
        var fileUpload = CreateFileUpload("sky.hdr");
        var file = CreateEnvironmentMapFile("sky.hdr", now).WithId(91);

        _environmentMapRepository
            .Setup(x => x.GetByIdAsync(environmentMap.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(environmentMap);

        _fileCreationService
            .Setup(x => x.CreateOrGetExistingFileAsync(fileUpload, It.IsAny<FileType>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(file));

        _sizeLabelService
            .Setup(x => x.InferSizeLabelAsync(
                It.Is<IReadOnlyCollection<DomainFile>>(files => files.Single().Id == file.Id),
                EnvironmentMapProjectionType.Panoramic,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success("4K"));

        _thumbnailQueue
            .Setup(x => x.EnqueueEnvironmentMapThumbnailAsync(environmentMap.Id, It.IsAny<int>(), true, It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(ThumbnailJob.CreateForEnvironmentMap(environmentMap.Id, 91, now));

        _environmentMapRepository
            .Setup(x => x.UpdateAsync(environmentMap, It.IsAny<CancellationToken>()))
            .ReturnsAsync((EnvironmentMap map, CancellationToken _) => map);

        var handler = new AddEnvironmentMapVariantWithFileCommandHandler(
            _environmentMapRepository.Object,
            _fileCreationService.Object,
            _sizeLabelService.Object,
            _thumbnailQueue.Object,
            _dateTimeProvider.Object);

        var result = await handler.Handle(
            new AddEnvironmentMapVariantWithFileCommand(environmentMap.Id, fileUpload, null, null),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("4K", environmentMap.Variants.Single().SizeLabel);
        _sizeLabelService.Verify(
            x => x.InferSizeLabelAsync(
                It.IsAny<IReadOnlyCollection<DomainFile>>(),
                EnvironmentMapProjectionType.Panoramic,
                It.IsAny<CancellationToken>()),
            Times.Once);
        _thumbnailQueue.Verify(
            x => x.EnqueueEnvironmentMapThumbnailAsync(environmentMap.Id, It.IsAny<int>(), true, It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    private static IFileUpload CreateFileUpload(string fileName)
    {
        var data = new byte[] { 1, 2, 3, 4 };
        var mock = new Mock<IFileUpload>();
        mock.Setup(x => x.FileName).Returns(fileName);
        mock.Setup(x => x.ContentType).Returns("application/octet-stream");
        mock.Setup(x => x.Length).Returns(data.Length);
        mock.Setup(x => x.OpenRead()).Returns(new MemoryStream(data, writable: false));
        mock.Setup(x => x.CopyToAsync(It.IsAny<Stream>(), It.IsAny<CancellationToken>()))
            .Returns<Stream, CancellationToken>((stream, ct) => stream.WriteAsync(data, 0, data.Length, ct));
        return mock.Object;
    }

    private static DomainFile CreateEnvironmentMapFile(string fileName, DateTime createdAt)
    {
        return DomainFile.Create(
            fileName,
            fileName,
            $"/uploads/{fileName}",
            "image/vnd.radiance",
            FileType.Hdr,
            1024,
            "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
            createdAt);
    }
}
