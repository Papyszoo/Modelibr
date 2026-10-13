using Application.Abstractions;
using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Files;
using Application.Services;
using Application.TextureSets;
using Domain.Services;
using Domain.ValueObjects;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SharedKernel;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Application.Tests.TextureSets;

/// <summary>
/// The target context decides a file's type. Regression these pin: store
/// texture packs ship .webp and .ktx2 maps, and every free texture pack
/// import failed with "File type 'WebP Image' is not a texture" /
/// "File type 'Other file type' is not a texture" because the global
/// extension map calls WebP a sprite and has no .ktx2 entry - while
/// Texture.Create only accepts Texture-category files.
/// </summary>
public class TextureContextFileTypeTests
{
    private readonly Mock<IFileCreationService> _fileCreation = new();
    private readonly Mock<ITextureSetRepository> _textureSetRepository = new();
    private readonly Mock<ITextureSetCategoryRepository> _categoryRepository = new();
    private readonly Mock<IBatchUploadRepository> _batchUploadRepository = new();
    private readonly Mock<ISettingRepository> _settingRepository = new();
    private readonly Mock<IDateTimeProvider> _dateTimeProvider = new();
    private readonly Mock<IThumbnailQueue> _thumbnailQueue = new();
    private readonly Mock<ITextureImageMetadataReader> _metadataReader = new();
    private readonly Mock<IUnitOfWork> _unitOfWork = new();

    private FileType? _resolvedFileType;

    public TextureContextFileTypeTests()
    {
        _dateTimeProvider.Setup(x => x.UtcNow).Returns(DateTime.UtcNow);
        _fileCreation
            .Setup(x => x.CreateOrGetExistingFileAsync(It.IsAny<IFileUpload>(), It.IsAny<FileType>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((IFileUpload upload, FileType fileType, CancellationToken _) =>
            {
                _resolvedFileType = fileType;
                return Result.Success(DomainFile.Create(
                    upload.FileName,
                    $"stored_{upload.FileName}",
                    $"ab/cd/{upload.FileName}",
                    fileType.GetMimeType(),
                    fileType,
                    1024L,
                    new string('a', 64),
                    DateTime.UtcNow));
            });
    }

    private CreateTextureSetWithFileCommandHandler CreateSetHandler() => new(
        _textureSetRepository.Object,
        _categoryRepository.Object,
        _batchUploadRepository.Object,
        _fileCreation.Object,
        _settingRepository.Object,
        _dateTimeProvider.Object,
        _thumbnailQueue.Object,
        _metadataReader.Object,
        NullLogger<CreateTextureSetWithFileCommandHandler>.Instance,
        _unitOfWork.Object);

    private static Mock<IFileUpload> Upload(string fileName)
    {
        var upload = new Mock<IFileUpload>();
        upload.SetupGet(x => x.FileName).Returns(fileName);
        return upload;
    }

    private void SetUpSuccessfulSetCreation()
    {
        _textureSetRepository.Setup(x => x.AddAsync(It.IsAny<Domain.Models.TextureSet>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Domain.Models.TextureSet ts, CancellationToken _) => ts);
        _textureSetRepository.Setup(x => x.UpdateAsync(It.IsAny<Domain.Models.TextureSet>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Domain.Models.TextureSet ts, CancellationToken _) => ts);
    }

    [Theory]
    [InlineData("brick_albedo.ktx2")]
    [InlineData("brick_normal.webp")]
    public async Task CreateTextureSetWithFile_WithWebpOrKtx2_StoresTheFileAsTexture(string fileName)
    {
        SetUpSuccessfulSetCreation();

        var result = await CreateSetHandler().Handle(
            new CreateTextureSetWithFileCommand(Upload(fileName).Object, "Brick", TextureType.Albedo, BatchId: null),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(FileType.Texture, _resolvedFileType);
    }

    [Fact]
    public async Task CreateTextureSetWithFile_WithANonImage_IsRejectedBeforeAnyFileIsStored()
    {
        var result = await CreateSetHandler().Handle(
            new CreateTextureSetWithFileCommand(Upload("chair.glb").Object, "Brick", TextureType.Albedo, BatchId: null),
            CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal("InvalidFileType", result.Error.Code);
        _fileCreation.Verify(
            x => x.CreateOrGetExistingFileAsync(It.IsAny<IFileUpload>(), It.IsAny<FileType>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task AddTextureToSetWithFile_WithWebp_StoresTheFileAsTexture()
    {
        var addTexture = new Mock<ICommandHandler<AddTextureToTextureSetCommand, AddTextureToTextureSetResponse>>();
        addTexture
            .Setup(x => x.Handle(It.IsAny<AddTextureToTextureSetCommand>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new AddTextureToTextureSetResponse(1, TextureType.Normal, TextureChannel.RGB)));

        var fileRepository = new Mock<IFileRepository>();
        fileRepository.Setup(x => x.AddAsync(It.IsAny<DomainFile>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var handler = new AddTextureToSetWithFileCommandHandler(
            _fileCreation.Object,
            fileRepository.Object,
            addTexture.Object,
            _unitOfWork.Object);

        var result = await handler.Handle(
            new AddTextureToSetWithFileCommand(2, Upload("brick_normal.webp").Object, TextureType.Normal),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(FileType.Texture, _resolvedFileType);
    }

    [Fact]
    public async Task UploadFile_WithTextureUploadType_ResolvesWebpAsTexture()
    {
        var handler = CreateUploadHandler();

        var result = await handler.Handle(
            new UploadFileCommand(Upload("brick_roughness.webp").Object, UploadType: "texture", TextureSetId: 5),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(FileType.Texture, _resolvedFileType);
    }

    [Fact]
    public async Task UploadFile_WithoutTextureUploadType_KeepsWebpAsASprite()
    {
        // Without the texture context a WebP is still the sprite the global
        // extension map says it is - sprite uploads must not change.
        var handler = CreateUploadHandler();

        var result = await handler.Handle(
            new UploadFileCommand(Upload("hero.webp").Object),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(FileType.WebP, _resolvedFileType);
    }

    private UploadFileCommandHandler CreateUploadHandler()
    {
        var filePersistence = new Mock<IFilePersistence>();
        return new UploadFileCommandHandler(
            _fileCreation.Object,
            filePersistence.Object,
            _batchUploadRepository.Object,
            _dateTimeProvider.Object,
            _unitOfWork.Object);
    }
}
