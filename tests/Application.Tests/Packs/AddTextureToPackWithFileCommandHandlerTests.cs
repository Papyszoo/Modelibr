using Application.Abstractions.Files;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Packs;
using Application.Services;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Moq;
using SharedKernel;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Application.Tests.Packs;

/// <summary>
/// Texture sets created through the pack upload path are ModelSpecific (no worker
/// pass), so their source-image resolution must be extracted on the backend at
/// upload time — but only when a new texture is created, never when an existing
/// set is reused by file hash.
/// </summary>
public class AddTextureToPackWithFileCommandHandlerTests
{
    private readonly Mock<IPackRepository> _packRepository = new();
    private readonly Mock<ITextureSetRepository> _textureSetRepository = new();
    private readonly Mock<IBatchUploadRepository> _batchUploadRepository = new();
    private readonly Mock<IFileCreationService> _fileCreationService = new();
    private readonly Mock<IDateTimeProvider> _dateTimeProvider = new();
    private readonly Mock<ITextureImageMetadataReader> _metadataReader = new();

    public AddTextureToPackWithFileCommandHandlerTests()
    {
        _dateTimeProvider.Setup(x => x.UtcNow).Returns(DateTime.UtcNow);
        _packRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Pack.Create("Pack", null, null, null, DateTime.UtcNow));
    }

    private AddTextureToPackWithFileCommandHandler CreateHandler() => new(
        _packRepository.Object,
        _textureSetRepository.Object,
        _batchUploadRepository.Object,
        _fileCreationService.Object,
        _dateTimeProvider.Object,
        _metadataReader.Object);

    [Fact]
    public async Task Handle_NewTextureSet_ExtractsAndPersistsImageMetadata()
    {
        var file = CreateTextureFile();
        _fileCreationService.Setup(x => x.CreateOrGetExistingFileAsync(It.IsAny<IFileUpload>(), It.IsAny<FileType>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(file));
        _textureSetRepository.Setup(x => x.GetByFileHashAsync(file.Sha256Hash, It.IsAny<CancellationToken>()))
            .ReturnsAsync((TextureSet?)null);
        TextureSet? captured = null;
        _textureSetRepository.Setup(x => x.AddAsync(It.IsAny<TextureSet>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((TextureSet ts, CancellationToken _) => { captured = ts; return ts; });
        _metadataReader.Setup(x => x.ReadAsync(file, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new TextureImageMetadata(1024, 1024, "png"));

        var result = await CreateHandler().Handle(
            new AddTextureToPackWithFileCommand(1, CreateUpload(), "Rock", TextureType.Albedo),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.NotNull(captured);
        var texture = Assert.Single(captured!.Textures);
        Assert.Equal(1024, texture.Width);
        Assert.Equal(1024, texture.Height);
        Assert.Equal("png", texture.Format);
        _metadataReader.Verify(x => x.ReadAsync(file, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_ExistingTextureSetReusedByHash_DoesNotExtractMetadata()
    {
        var file = CreateTextureFile();
        _fileCreationService.Setup(x => x.CreateOrGetExistingFileAsync(It.IsAny<IFileUpload>(), It.IsAny<FileType>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(file));
        _textureSetRepository.Setup(x => x.GetByFileHashAsync(file.Sha256Hash, It.IsAny<CancellationToken>()))
            .ReturnsAsync(TextureSet.Create("Existing", DateTime.UtcNow));

        var result = await CreateHandler().Handle(
            new AddTextureToPackWithFileCommand(1, CreateUpload(), "Rock", TextureType.Albedo),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        _metadataReader.Verify(x => x.ReadAsync(It.IsAny<DomainFile>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    private static IFileUpload CreateUpload()
    {
        var upload = new Mock<IFileUpload>();
        upload.SetupGet(x => x.FileName).Returns("rock.png");
        return upload.Object;
    }

    private static DomainFile CreateTextureFile()
    {
        var file = DomainFile.Create(
            "texture.png", "stored.png", "ab/cd/texture.png", "image/png",
            FileType.Texture, 1024L,
            "a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd", DateTime.UtcNow);
        typeof(DomainFile).GetProperty("Id")!.SetValue(file, 7);
        return file;
    }
}
