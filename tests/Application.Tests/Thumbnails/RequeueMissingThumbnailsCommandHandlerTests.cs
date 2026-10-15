using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Abstractions.Storage;
using Application.Thumbnails;
using Application.Tests;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Moq;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Application.Tests.Thumbnails;

/// <summary>
/// A restore that leaves thumbnails out brings back "ready" rows whose files are
/// gone. These cover the re-queue that repairs that: only rows whose file is
/// actually missing are enqueued, and an archive that carried thumbnails queues
/// nothing.
/// </summary>
public class RequeueMissingThumbnailsCommandHandlerTests : IDisposable
{
    private static readonly DateTime Now = new(2026, 10, 10, 12, 0, 0, DateTimeKind.Utc);
    private const string ValidHash = "a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd";
    private const string DefaultJson = """{"version":1,"duration":2,"loop":false,"components":[]}""";

    private readonly string _uploadRoot =
        Path.Combine(Path.GetTempPath(), "modelibr_requeue_tests", Guid.NewGuid().ToString("N"));

    private readonly Mock<IModelRepository> _models = new();
    private readonly Mock<IThumbnailRepository> _thumbnails = new();
    private readonly Mock<ITextureSetRepository> _textureSets = new();
    private readonly Mock<IEnvironmentMapRepository> _environmentMaps = new();
    private readonly Mock<IVfxRepository> _vfx = new();
    private readonly Mock<IThumbnailQueue> _queue = new();
    private readonly Mock<IDateTimeProvider> _dateTimeProvider = new();
    private readonly Mock<IUnitOfWork> _unitOfWork = new();

    private Thumbnail _modelThumbnail = null!;

    public RequeueMissingThumbnailsCommandHandlerTests()
    {
        Directory.CreateDirectory(_uploadRoot);

        _dateTimeProvider.SetupGet(d => d.UtcNow).Returns(Now);

        _models.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>())).ReturnsAsync([]);
        _textureSets.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>())).ReturnsAsync([]);
        _environmentMaps.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>())).ReturnsAsync([]);
        _vfx.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>())).ReturnsAsync([]);
    }

    public void Dispose()
    {
        if (Directory.Exists(_uploadRoot)) Directory.Delete(_uploadRoot, recursive: true);
    }

    private RequeueMissingThumbnailsCommandHandler NewHandler()
    {
        var paths = new Mock<IUploadPathProvider>();
        paths.SetupGet(p => p.UploadRootPath).Returns(_uploadRoot);
        return new RequeueMissingThumbnailsCommandHandler(
            _models.Object,
            _thumbnails.Object,
            _textureSets.Object,
            _environmentMaps.Object,
            _vfx.Object,
            _queue.Object,
            paths.Object,
            _dateTimeProvider.Object,
            _unitOfWork.Object);
    }

    private void GivenModelThumbnail(string storedPath)
    {
        var model = Model.Create("Model", Now).WithId(1);
        var version = model.CreateVersion("v1", Now).WithId(10);
        version.AddFile(DomainFile.Create(
            "model.obj", "stored.obj", "/path/1", "model/obj", FileType.Obj, 1024, ValidHash, Now));

        var thumbnail = Thumbnail.Create(1, 10, Now).WithId(5);
        thumbnail.MarkAsReady(storedPath, 1024, 256, 256, Now);
        _modelThumbnail = thumbnail;

        _models.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>())).ReturnsAsync([model]);
        _thumbnails
            .Setup(r => r.GetByModelVersionIdAsync(10, It.IsAny<CancellationToken>()))
            .ReturnsAsync(thumbnail);
    }

    private void GivenFileAt(string storedPath)
    {
        var full = Path.Combine(_uploadRoot, storedPath);
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        System.IO.File.WriteAllBytes(full, [1, 2, 3]);
    }

    [Fact]
    public async Task Handle_WhenAReadyModelThumbnailFileIsMissing_EnqueuesIt()
    {
        GivenModelThumbnail("ab/cd/missing");

        var result = await NewHandler().Handle(new RequeueMissingThumbnailsCommand(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value.EnqueuedCount);
        _queue.Verify(q => q.EnqueueAsync(1, 10, ValidHash, true, It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_ResetsTheMissingThumbnailToPendingAndPersistsIt()
    {
        // The row said Ready but its file is gone: the status endpoint would report
        // a thumbnail the file endpoint 404s on. Re-queueing must put it back to
        // Pending and commit that, not leave a Ready row pointing at nothing.
        GivenModelThumbnail("ab/cd/missing");

        await NewHandler().Handle(new RequeueMissingThumbnailsCommand(), CancellationToken.None);

        Assert.Equal(ThumbnailStatus.Pending, _modelThumbnail.Status);
        _thumbnails.Verify(
            r => r.UpdateAsync(_modelThumbnail, It.IsAny<CancellationToken>()),
            Times.Once);
        _unitOfWork.Verify(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_LeavesAReadyThumbnailWhoseFileIsPresentAlone()
    {
        GivenModelThumbnail("ab/cd/present");
        GivenFileAt("ab/cd/present");

        await NewHandler().Handle(new RequeueMissingThumbnailsCommand(), CancellationToken.None);

        Assert.Equal(ThumbnailStatus.Ready, _modelThumbnail.Status);
        _thumbnails.Verify(
            r => r.UpdateAsync(It.IsAny<Thumbnail>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_WhenTheThumbnailFileIsPresent_EnqueuesNothing()
    {
        GivenModelThumbnail("ab/cd/present");
        GivenFileAt("ab/cd/present");

        var result = await NewHandler().Handle(new RequeueMissingThumbnailsCommand(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(0, result.Value.EnqueuedCount);
        _queue.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task Handle_WhenNoAssetsExist_ReturnsZero()
    {
        var result = await NewHandler().Handle(new RequeueMissingThumbnailsCommand(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(0, result.Value.EnqueuedCount);
        _queue.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task Handle_RequeuesTextureSetWhoseFileIsMissing()
    {
        var textureSet = TextureSet.Create("Set", Now).WithId(3);
        textureSet.SetThumbnailPath("ab/cd/ts-missing", Now);
        _textureSets.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>())).ReturnsAsync([textureSet]);

        var result = await NewHandler().Handle(new RequeueMissingThumbnailsCommand(), CancellationToken.None);

        Assert.Equal(1, result.Value.EnqueuedCount);
        _queue.Verify(q => q.EnqueueTextureSetThumbnailAsync(3, null, true, It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_RequeuesVfxWhoseFileIsMissing()
    {
        var vfx = Domain.Models.Vfx.Create("Sparks", null, DefaultJson, Now).WithId(4);
        vfx.SetThumbnailPath("ab/cd/vfx-missing", Now);
        _vfx.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>())).ReturnsAsync([vfx]);

        var result = await NewHandler().Handle(new RequeueMissingThumbnailsCommand(), CancellationToken.None);

        Assert.Equal(1, result.Value.EnqueuedCount);
        _queue.Verify(q => q.EnqueueVfxThumbnailAsync(4, true, It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_RequeuesEnvironmentMapVariantWhoseFileIsMissing()
    {
        var environmentMap = EnvironmentMap.Create("Env", Now).WithId(9);
        var sourceFile = DomainFile.Create(
            "env.hdr", "stored.hdr", "/path/9", "image/vnd.radiance", FileType.Obj, 2048, ValidHash, Now);
        var variant = EnvironmentMapVariant.CreatePanoramic(sourceFile, "1k", Now).WithId(11);
        variant.SetThumbnailPath("ab/cd/env-missing", Now);
        environmentMap.AddVariant(variant, Now);
        _environmentMaps.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>())).ReturnsAsync([environmentMap]);

        var result = await NewHandler().Handle(new RequeueMissingThumbnailsCommand(), CancellationToken.None);

        Assert.Equal(1, result.Value.EnqueuedCount);
        _queue.Verify(
            q => q.EnqueueEnvironmentMapThumbnailAsync(9, 11, true, It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }
}
