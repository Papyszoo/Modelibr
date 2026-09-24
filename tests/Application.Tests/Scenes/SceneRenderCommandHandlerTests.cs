using Application.Abstractions;
using Application.Abstractions.Files;
using Application.Abstractions.Repositories;
using Application.Abstractions.Storage;
using Application.Scenes;
using Application.ThumbnailJobs;
using Domain.Files;
using Domain.Models;
using Domain.Services;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace Application.Tests.Scenes;

public class SceneRenderCommandHandlerTests
{
    private static readonly DateTime Now = new(2026, 9, 25, 12, 0, 0, DateTimeKind.Utc);

    private readonly Mock<IThumbnailJobRepository> _jobs = new();
    private readonly Mock<ISceneRenderRepository> _renders = new();
    private readonly Mock<ISceneRepository> _scenes = new();
    private readonly Mock<IFileStorage> _files = new();
    private readonly Mock<IUploadPathProvider> _paths = new();
    private readonly Mock<IDateTimeProvider> _clock = new();
    private readonly Mock<IUnitOfWork> _unitOfWork = new();
    private readonly UploadSceneRenderCommandHandler _uploadHandler;
    private readonly Mock<IFileUpload> _upload = new();

    public SceneRenderCommandHandlerTests()
    {
        _clock.SetupGet(c => c.UtcNow).Returns(Now);
        _paths.SetupGet(p => p.UploadRootPath).Returns("/uploads");
        _unitOfWork
            .Setup(u => u.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        _renders
            .Setup(r => r.GetByJobIdAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((SceneRender?)null);

        _uploadHandler = new UploadSceneRenderCommandHandler(
            _jobs.Object,
            _renders.Object,
            _scenes.Object,
            _files.Object,
            _paths.Object,
            _clock.Object,
            _unitOfWork.Object);
    }

    [Fact]
    public async Task Handle_WhenRenderPageTimedOut_StoresNoFileOrRender()
    {
        var job = GivenJob();
        _jobs
            .Setup(r => r.GetByIdAsync(job.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(job);

        var result = await _uploadHandler.Handle(
            new UploadSceneRenderCommand(
                job.Id,
                _upload.Object,
                768,
                768,
                1,
                2,
                TimedOut: true),
            CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("SceneRenderNotReady", result.Error.Code);
        _files.Verify(
            f => f.SaveAsync(
                It.IsAny<IFileUpload>(),
                It.IsAny<FileType>(),
                It.IsAny<CancellationToken>()),
            Times.Never);
        _renders.Verify(
            r => r.AddAsync(It.IsAny<SceneRender>(), It.IsAny<CancellationToken>()),
            Times.Never);
        _unitOfWork.Verify(
            u => u.SaveChangesAsync(It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_WhenRenderPageIsReady_StoresAQueryableOutputPath()
    {
        var job = GivenJob();
        _jobs
            .Setup(r => r.GetByIdAsync(job.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(job);
        _files
            .Setup(f => f.SaveAsync(
                _upload.Object,
                FileType.Texture,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new StoredFileResult(
                "renders/scene.png",
                "scene.png",
                new string('a', 64),
                321));

        SceneRender? storedRender = null;
        _renders
            .Setup(r => r.AddAsync(It.IsAny<SceneRender>(), It.IsAny<CancellationToken>()))
            .Callback<SceneRender, CancellationToken>((render, _) =>
            {
                storedRender = render.WithId(88);
            })
            .Returns(Task.CompletedTask);

        var result = await _uploadHandler.Handle(
            new UploadSceneRenderCommand(
                job.Id,
                _upload.Object,
                768,
                512,
                3,
                1,
                TimedOut: false),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(Path.Combine("/uploads", "renders/scene.png"), result.Value.FilePath);
        Assert.NotNull(storedRender);
        Assert.False(storedRender.TimedOut);
        Assert.Equal(job.SceneId, storedRender.SceneId);
        Assert.Equal(job.Id, storedRender.ThumbnailJobId);

        _renders
            .Setup(r => r.GetByJobIdAsync(job.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(storedRender);
        var query = new GetSceneRenderQueryHandler(_renders.Object, _jobs.Object);
        var view = await query.Handle(new GetSceneRenderQuery(job.Id), CancellationToken.None);

        Assert.True(view.IsSuccess);
        Assert.Equal("Ready", view.Value.Status);
        Assert.Equal(result.Value.FilePath, storedRender.FilePath);
    }

    [Fact]
    public async Task Handle_WhenRendererPublishesFailure_ClosesTheJobAsFailed()
    {
        var job = ThumbnailJob.CreateForScene(
            12,
            "front",
            Now.AddMinutes(-1),
            maxAttempts: 1,
            sceneRevision: 3).WithId(41);
        Assert.True(job.TryClaim("worker-1", Now));
        _jobs
            .Setup(r => r.GetByIdAsync(job.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(job);
        var handler = new FinishSceneRenderJobCommandHandler(
            _jobs.Object,
            _clock.Object,
            Mock.Of<ILogger<FinishSceneRenderJobCommandHandler>>(),
            _unitOfWork.Object);
        const string diagnostic = "Scene 12 could not be drawn: the scene API returned 503";

        var result = await handler.Handle(
            new FinishSceneRenderJobCommand(job.Id, false, diagnostic),
            CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("Dead", result.Value.Status);
        Assert.Equal(diagnostic, job.ErrorMessage);
        _jobs.Verify(r => r.UpdateAsync(job, It.IsAny<CancellationToken>()), Times.Once);
    }

    private static ThumbnailJob GivenJob() =>
        ThumbnailJob.CreateForScene(
            12,
            "front",
            Now.AddMinutes(-1),
            sceneRevision: 3).WithId(41);
}
