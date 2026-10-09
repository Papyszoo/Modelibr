using Application.Abstractions;
using Application.Abstractions.Files;
using Application.Abstractions.Repositories;
using Application.Abstractions.Storage;
using Application.ThumbnailJobs;
using Application.Vfx;
using Domain.Files;
using Domain.Models;
using Domain.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace Application.Tests.Vfx;

public class VfxThumbnailTests
{
    private static readonly DateTime Now = new(2026, 10, 9, 12, 0, 0, DateTimeKind.Utc);
    private const string DefaultJson = """{"version":1,"duration":2,"loop":false,"components":[]}""";

    private readonly Mock<IVfxRepository> _vfx = new();
    private readonly Mock<IFileStorage> _storage = new();
    private readonly Mock<IUploadPathProvider> _paths = new();
    private readonly Mock<IDateTimeProvider> _clock = new();
    private readonly Mock<IUnitOfWork> _unitOfWork = new();
    private readonly Mock<IThumbnailJobRepository> _jobs = new();

    public VfxThumbnailTests()
    {
        _clock.Setup(c => c.UtcNow).Returns(Now);
        _paths.Setup(p => p.UploadRootPath).Returns("/uploads");
        _storage.Setup(s => s.SaveAsync(It.IsAny<IFileUpload>(), It.IsAny<FileType>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new StoredFileResult("ab/cd/abcdef", "abcdef", "abcdef", 1234));
    }

    private UploadVfxThumbnailCommandHandler UploadHandler() =>
        new(_vfx.Object, _storage.Object, _paths.Object, _clock.Object, _unitOfWork.Object);

    private static IFileUpload Upload(string contentType)
    {
        var file = new Mock<IFileUpload>();
        file.Setup(f => f.ContentType).Returns(contentType);
        return file.Object;
    }

    [Fact]
    public void ThumbnailUrl_IsNullUntilAThumbnailExists()
    {
        var vfx = Domain.Models.Vfx.Create("Sparks", null, DefaultJson, Now);

        Assert.Null(VfxDetailDto.From(vfx).ThumbnailUrl);
        Assert.Null(VfxSummaryDto.From(vfx).ThumbnailUrl);
    }

    // Regression: a re-render replaced the file but the browser kept the cached old picture
    // because the URL never changed. The content hash in the path must reach the URL.
    [Fact]
    public void ThumbnailUrl_ChangesWhenTheStoredFileChanges()
    {
        var vfx = Domain.Models.Vfx.Create("Sparks", null, DefaultJson, Now);

        vfx.SetThumbnailPath("/uploads/ab/cd/first", Now);
        var first = VfxSummaryDto.From(vfx).ThumbnailUrl;
        vfx.SetThumbnailPath("/uploads/ab/cd/second", Now);
        var second = VfxDetailDto.From(vfx).ThumbnailUrl;

        Assert.StartsWith("/vfx/", first);
        Assert.EndsWith("/thumbnail/file?v=first", first);
        Assert.EndsWith("/thumbnail/file?v=second", second);
    }

    [Fact]
    public async Task Upload_StoresTheWebpAndPointsTheEffectAtIt()
    {
        var vfx = Domain.Models.Vfx.Create("Sparks", null, DefaultJson, Now);
        _vfx.Setup(r => r.GetByIdAsync(7, It.IsAny<CancellationToken>())).ReturnsAsync(vfx);

        var result = await UploadHandler().Handle(
            new UploadVfxThumbnailCommand(7, Upload("image/webp")), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(Path.Combine("/uploads", "ab/cd/abcdef"), vfx.ThumbnailPath);
        _vfx.Verify(r => r.UpdateAsync(vfx, It.IsAny<CancellationToken>()), Times.Once);
        _unitOfWork.Verify(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Upload_ForAnUnknownEffect_ReportsNotFoundAndStoresNothing()
    {
        _vfx.Setup(r => r.GetByIdAsync(404, It.IsAny<CancellationToken>())).ReturnsAsync((Domain.Models.Vfx?)null);

        var result = await UploadHandler().Handle(
            new UploadVfxThumbnailCommand(404, Upload("image/webp")), CancellationToken.None);

        Assert.Equal("VfxNotFound", result.Error.Code);
        _storage.Verify(s => s.SaveAsync(It.IsAny<IFileUpload>(), It.IsAny<FileType>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Upload_RejectsAnythingButWebp()
    {
        var vfx = Domain.Models.Vfx.Create("Sparks", null, DefaultJson, Now);
        _vfx.Setup(r => r.GetByIdAsync(7, It.IsAny<CancellationToken>())).ReturnsAsync(vfx);

        var result = await UploadHandler().Handle(
            new UploadVfxThumbnailCommand(7, Upload("text/html")), CancellationToken.None);

        Assert.Equal("InvalidThumbnailType", result.Error.Code);
        Assert.Null(vfx.ThumbnailPath);
    }

    private FinishVfxThumbnailJobCommandHandler FinishHandler() =>
        new(_jobs.Object, _clock.Object, NullLogger<FinishVfxThumbnailJobCommandHandler>.Instance, _unitOfWork.Object);

    [Fact]
    public async Task Finish_OnSuccess_CompletesTheJob()
    {
        var job = ThumbnailJob.CreateForVfx(7, Now.AddMinutes(-1)).WithId(3);
        _jobs.Setup(r => r.GetByIdAsync(3, It.IsAny<CancellationToken>())).ReturnsAsync(job);

        var result = await FinishHandler().Handle(new FinishVfxThumbnailJobCommand(3, true), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(7, result.Value.VfxId);
        Assert.Equal(Domain.ValueObjects.ThumbnailJobStatus.Done, job.Status);
    }

    [Fact]
    public async Task Finish_OnFailure_RecordsTheErrorAndKeepsTheJobRetryable()
    {
        var job = ThumbnailJob.CreateForVfx(7, Now.AddMinutes(-1)).WithId(3);
        _jobs.Setup(r => r.GetByIdAsync(3, It.IsAny<CancellationToken>())).ReturnsAsync(job);

        var result = await FinishHandler().Handle(
            new FinishVfxThumbnailJobCommand(3, false, "page never became ready"), CancellationToken.None);

        Assert.Equal("Failed", result.Value.Status);
        Assert.Equal("page never became ready", job.ErrorMessage);
    }

    // Regression guard: the vfx endpoint must not close a job that belongs to another asset type.
    [Fact]
    public async Task Finish_RejectsAJobThatIsNotForAnEffect()
    {
        var job = ThumbnailJob.CreateForTextureSet(5, Now).WithId(3);
        _jobs.Setup(r => r.GetByIdAsync(3, It.IsAny<CancellationToken>())).ReturnsAsync(job);

        var result = await FinishHandler().Handle(new FinishVfxThumbnailJobCommand(3, true), CancellationToken.None);

        Assert.Equal("InvalidJobType", result.Error.Code);
        Assert.Equal(Domain.ValueObjects.ThumbnailJobStatus.Pending, job.Status);
    }

    private readonly Mock<Application.Abstractions.Services.IThumbnailQueue> _queue = new();

    [Fact]
    public async Task RegenerateAll_ForcesAJobForEveryEffectAndTouchesNothingElse()
    {
        var effects = new[]
        {
            Domain.Models.Vfx.Create("A", null, DefaultJson, Now).WithId(1),
            Domain.Models.Vfx.Create("B", null, DefaultJson, Now).WithId(2),
        };
        _vfx.Setup(r => r.GetAllAsync(It.IsAny<CancellationToken>())).ReturnsAsync(effects);
        var handler = new RegenerateAllVfxThumbnailsCommandHandler(_vfx.Object, _queue.Object);

        var result = await handler.Handle(new RegenerateAllVfxThumbnailsCommand(), CancellationToken.None);

        Assert.Equal(2, result.Value.EnqueuedCount);
        _queue.Verify(q => q.EnqueueVfxThumbnailAsync(1, true, It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Once);
        _queue.Verify(q => q.EnqueueVfxThumbnailAsync(2, true, It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Once);
        // Only the vfx entry point of the queue may be used: no model or texture set work.
        _queue.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task Regenerate_ForAnUnknownEffect_ReportsNotFoundAndQueuesNothing()
    {
        _vfx.Setup(r => r.GetByIdAsync(404, It.IsAny<CancellationToken>())).ReturnsAsync((Domain.Models.Vfx?)null);
        var handler = new RegenerateVfxThumbnailCommandHandler(_vfx.Object, _queue.Object);

        var result = await handler.Handle(new RegenerateVfxThumbnailCommand(404), CancellationToken.None);

        Assert.Equal("VfxNotFound", result.Error.Code);
        _queue.VerifyNoOtherCalls();
    }

    [Fact]
    public async Task Regenerate_ForcesTheEffectsJob()
    {
        var vfx = Domain.Models.Vfx.Create("A", null, DefaultJson, Now).WithId(5);
        _vfx.Setup(r => r.GetByIdAsync(5, It.IsAny<CancellationToken>())).ReturnsAsync(vfx);
        var handler = new RegenerateVfxThumbnailCommandHandler(_vfx.Object, _queue.Object);

        var result = await handler.Handle(new RegenerateVfxThumbnailCommand(5), CancellationToken.None);

        Assert.True(result.IsSuccess);
        _queue.Verify(q => q.EnqueueVfxThumbnailAsync(5, true, It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Once);
    }
}
