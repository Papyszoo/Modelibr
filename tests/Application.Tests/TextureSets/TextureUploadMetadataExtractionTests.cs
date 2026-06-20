using Application.Abstractions.Files;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Services;
using Application.TextureSets;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SharedKernel;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Application.Tests.TextureSets;

/// <summary>
/// Covers the backend texture-image metadata extraction added so non-Universal
/// (Multi-Model / Single-Model) texture sets — which never get a worker thumbnail
/// pass — still capture their source-image resolution at upload time. Universal
/// sets must NOT extract here; they get their metadata from the worker job.
/// </summary>
public class TextureUploadMetadataExtractionTests
{
    private readonly Mock<ITextureSetRepository> _textureSetRepository = new();
    private readonly Mock<IFileRepository> _fileRepository = new();
    private readonly Mock<IBatchUploadRepository> _batchUploadRepository = new();
    private readonly Mock<IDateTimeProvider> _dateTimeProvider = new();
    private readonly Mock<IThumbnailQueue> _thumbnailQueue = new();
    private readonly Mock<ITextureImageMetadataReader> _metadataReader = new();

    public TextureUploadMetadataExtractionTests()
    {
        _dateTimeProvider.Setup(x => x.UtcNow).Returns(DateTime.UtcNow);
    }

    private AddTextureToTextureSetCommandHandler CreateAddHandler() => new(
        _textureSetRepository.Object,
        _fileRepository.Object,
        _batchUploadRepository.Object,
        _dateTimeProvider.Object,
        _thumbnailQueue.Object,
        _metadataReader.Object,
        NullLogger<AddTextureToTextureSetCommandHandler>.Instance);

    [Fact]
    public async Task AddTexture_ToModelSpecificSet_ExtractsAndPersistsImageMetadata()
    {
        var textureSet = TextureSet.Create("Multi-Model Set", DateTime.UtcNow, TextureSetKind.ModelSpecific);
        var file = CreateTextureFile();
        _textureSetRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(textureSet);
        _fileRepository.Setup(x => x.GetByIdAsync(7, It.IsAny<CancellationToken>())).ReturnsAsync(file);
        _textureSetRepository.Setup(x => x.UpdateAsync(textureSet, It.IsAny<CancellationToken>())).ReturnsAsync(textureSet);
        _metadataReader.Setup(x => x.ReadAsync(file, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new TextureImageMetadata(2048, 1024, "png"));

        var result = await CreateAddHandler().Handle(
            new AddTextureToTextureSetCommand(1, 7, TextureType.Albedo), CancellationToken.None);

        Assert.True(result.IsSuccess);
        var texture = Assert.Single(textureSet.Textures);
        Assert.Equal(2048, texture.Width);
        Assert.Equal(1024, texture.Height);
        Assert.Equal("png", texture.Format);
        _metadataReader.Verify(x => x.ReadAsync(file, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task AddTexture_ToUniversalSet_DoesNotExtractMetadataOnBackend()
    {
        var textureSet = TextureSet.Create("Global Material", DateTime.UtcNow, TextureSetKind.Universal);
        var file = CreateTextureFile();
        _textureSetRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(textureSet);
        _fileRepository.Setup(x => x.GetByIdAsync(7, It.IsAny<CancellationToken>())).ReturnsAsync(file);
        _textureSetRepository.Setup(x => x.UpdateAsync(textureSet, It.IsAny<CancellationToken>())).ReturnsAsync(textureSet);

        var result = await CreateAddHandler().Handle(
            new AddTextureToTextureSetCommand(1, 7, TextureType.Albedo), CancellationToken.None);

        Assert.True(result.IsSuccess);
        var texture = Assert.Single(textureSet.Textures);
        Assert.Null(texture.Width);
        Assert.Null(texture.Height);
        _metadataReader.Verify(x => x.ReadAsync(It.IsAny<DomainFile>(), It.IsAny<CancellationToken>()), Times.Never);
        _thumbnailQueue.Verify(x => x.EnqueueTextureSetThumbnailAsync(
            1, It.IsAny<int?>(), It.IsAny<bool>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task CreateTextureSet_AsModelSpecific_ExtractsImageMetadata()
    {
        var file = CreateTextureFile();
        var fileCreation = new Mock<IFileCreationService>();
        fileCreation.Setup(x => x.CreateOrGetExistingFileAsync(It.IsAny<IFileUpload>(), It.IsAny<FileType>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(file));
        var settingRepository = new Mock<ISettingRepository>();
        var categoryRepository = new Mock<ITextureSetCategoryRepository>();
        TextureSet? captured = null;
        _textureSetRepository.Setup(x => x.AddAsync(It.IsAny<TextureSet>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((TextureSet ts, CancellationToken _) => { captured = ts; return ts; });
        _textureSetRepository.Setup(x => x.UpdateAsync(It.IsAny<TextureSet>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((TextureSet ts, CancellationToken _) => ts);
        _textureSetRepository.Setup(x => x.ExistsByNameAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync(false);
        _metadataReader.Setup(x => x.ReadAsync(file, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new TextureImageMetadata(4096, 4096, "jpeg"));
        var fileUpload = new Mock<IFileUpload>();
        fileUpload.SetupGet(x => x.FileName).Returns("brick.png");

        var handler = new CreateTextureSetWithFileCommandHandler(
            _textureSetRepository.Object,
            categoryRepository.Object,
            _batchUploadRepository.Object,
            fileCreation.Object,
            settingRepository.Object,
            _dateTimeProvider.Object,
            _thumbnailQueue.Object,
            _metadataReader.Object,
            NullLogger<CreateTextureSetWithFileCommandHandler>.Instance);

        var result = await handler.Handle(
            new CreateTextureSetWithFileCommand(
                fileUpload.Object, "Brick", TextureType.Albedo, BatchId: null, Kind: TextureSetKind.ModelSpecific),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.NotNull(captured);
        var texture = Assert.Single(captured!.Textures);
        Assert.Equal(4096, texture.Width);
        Assert.Equal(4096, texture.Height);
        Assert.Equal("jpeg", texture.Format);
    }

    private static DomainFile CreateTextureFile()
    {
        var file = DomainFile.Create(
            "texture.png",
            "stored_texture.png",
            "ab/cd/texture.png",
            "image/png",
            FileType.Texture,
            1024L,
            "a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd",
            DateTime.UtcNow);
        typeof(DomainFile).GetProperty("Id")!.SetValue(file, 7);
        return file;
    }
}
