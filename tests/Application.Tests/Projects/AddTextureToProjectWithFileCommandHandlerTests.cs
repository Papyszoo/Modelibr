using Application.Abstractions.Files;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Projects;
using Application.Services;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Moq;
using SharedKernel;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Application.Tests.Projects;

/// <summary>
/// Texture sets created through the project upload path are ModelSpecific (no worker
/// pass), so their source-image resolution must be extracted on the backend at
/// upload time — but only when a new texture is created, never when an existing
/// set is reused by file hash.
/// </summary>
public class AddTextureToProjectWithFileCommandHandlerTests
{
    private readonly Mock<IProjectRepository> _projectRepository = new();
    private readonly Mock<ITextureSetRepository> _textureSetRepository = new();
    private readonly Mock<IBatchUploadRepository> _batchUploadRepository = new();
    private readonly Mock<IFileCreationService> _fileCreationService = new();
    private readonly Mock<IDateTimeProvider> _dateTimeProvider = new();
    private readonly Mock<ITextureImageMetadataReader> _metadataReader = new();

    public AddTextureToProjectWithFileCommandHandlerTests()
    {
        _dateTimeProvider.Setup(x => x.UtcNow).Returns(DateTime.UtcNow);
        _projectRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Project.Create("Project", null, DateTime.UtcNow));
    }

    private AddTextureToProjectWithFileCommandHandler CreateHandler() => new(
        _projectRepository.Object,
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
            .ReturnsAsync(new TextureImageMetadata(2048, 2048, "jpeg"));

        var result = await CreateHandler().Handle(
            new AddTextureToProjectWithFileCommand(1, CreateUpload(), "Rock", TextureType.Albedo),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.NotNull(captured);
        var texture = Assert.Single(captured!.Textures);
        Assert.Equal(2048, texture.Width);
        Assert.Equal(2048, texture.Height);
        Assert.Equal("jpeg", texture.Format);
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
            new AddTextureToProjectWithFileCommand(1, CreateUpload(), "Rock", TextureType.Albedo),
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
