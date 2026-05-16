using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Thumbnails;
using Application.Tests;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Moq;
using SharedKernel;
using Xunit;

namespace Application.Tests.Thumbnails;

public class RegenerateAllThumbnailsCommandHandlerTests
{
    private const string ValidHash = "a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd";

    private readonly Mock<IModelRepository> _mockModelRepository = new();
    private readonly Mock<IModelVersionRepository> _mockModelVersionRepository = new();
    private readonly Mock<IThumbnailRepository> _mockThumbnailRepository = new();
    private readonly Mock<IThumbnailQueue> _mockThumbnailQueue = new();
    private readonly Mock<IDateTimeProvider> _mockDateTimeProvider = new();
    private readonly RegenerateAllThumbnailsCommandHandler _handler;

    public RegenerateAllThumbnailsCommandHandlerTests()
    {
        _handler = new RegenerateAllThumbnailsCommandHandler(
            _mockModelRepository.Object,
            _mockModelVersionRepository.Object,
            _mockThumbnailRepository.Object,
            _mockThumbnailQueue.Object,
            _mockDateTimeProvider.Object);

        _mockDateTimeProvider.Setup(x => x.UtcNow).Returns(DateTime.UtcNow);
    }

    private static Model BuildModelWithActiveVersionAndFile(int modelId, int versionId, string hash)
    {
        var model = Model.Create($"Model {modelId}", DateTime.UtcNow).WithId(modelId);
        var version = model.CreateVersion($"v{modelId}", DateTime.UtcNow).WithId(versionId);
        var file = Domain.Models.File.Create(
            $"file{modelId}.obj",
            $"stored-{modelId}.obj",
            $"/path/{modelId}",
            "model/obj",
            FileType.Obj,
            1024,
            hash,
            DateTime.UtcNow);
        version.AddFile(file);
        return model;
    }

    [Fact]
    public async Task Handle_WhenNoModelsExist_ReturnsZeroCounts()
    {
        _mockModelRepository
            .Setup(x => x.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<Model>());

        var result = await _handler.Handle(new RegenerateAllThumbnailsCommand(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(0, result.Value.EnqueuedCount);
        Assert.Equal(0, result.Value.SkippedCount);
    }

    [Fact]
    public async Task Handle_SkipsModelsWithoutFiles()
    {
        var emptyModel = Model.Create("EmptyModel", DateTime.UtcNow).WithId(1);
        emptyModel.CreateVersion("v1", DateTime.UtcNow).WithId(1);

        _mockModelRepository
            .Setup(x => x.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { emptyModel });

        var result = await _handler.Handle(new RegenerateAllThumbnailsCommand(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(0, result.Value.EnqueuedCount);
        Assert.Equal(1, result.Value.SkippedCount);
        _mockThumbnailQueue.Verify(
            x => x.EnqueueAsync(It.IsAny<int>(), It.IsAny<int>(), It.IsAny<string>(), It.IsAny<bool>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_ResetsExistingThumbnailAndEnqueuesJob_ForceRegenerateTrue()
    {
        var model = BuildModelWithActiveVersionAndFile(modelId: 1, versionId: 10, hash: ValidHash);
        var existing = Thumbnail.Create(1, 10, DateTime.UtcNow).WithId(99);
        existing.MarkAsReady("/old.png", 1, 256, 256, DateTime.UtcNow);
        model.ActiveVersion!.SetThumbnail(existing);

        _mockModelRepository
            .Setup(x => x.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { model });
        _mockThumbnailRepository
            .Setup(x => x.GetByModelVersionIdAsync(10, It.IsAny<CancellationToken>()))
            .ReturnsAsync(existing);

        var result = await _handler.Handle(new RegenerateAllThumbnailsCommand(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value.EnqueuedCount);

        // Existing row reset, not a new one created
        _mockThumbnailRepository.Verify(
            x => x.UpdateAsync(existing, It.IsAny<CancellationToken>()),
            Times.Once);
        _mockThumbnailRepository.Verify(
            x => x.AddAsync(It.IsAny<Thumbnail>(), It.IsAny<CancellationToken>()),
            Times.Never);

        // Job enqueued with forceRegenerate=true
        _mockThumbnailQueue.Verify(
            x => x.EnqueueAsync(1, 10, ValidHash, true, It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task Handle_RelinksOrphanedThumbnail_WhenFkIsNullButRowExists()
    {
        // The bug we're guarding against: a Thumbnail row exists with
        // ModelVersionId=10 but ModelVersion.ThumbnailId is NULL (orphan).
        // The handler must reattach the FK so the worker upload path doesn't
        // try to INSERT a duplicate and hit IX_Thumbnails_ModelVersionId.
        var model = BuildModelWithActiveVersionAndFile(modelId: 1, versionId: 10, hash: ValidHash);
        // Note: model.ActiveVersion.ThumbnailId is null (no SetThumbnail call).

        var orphaned = Thumbnail.Create(1, 10, DateTime.UtcNow).WithId(42);

        _mockModelRepository
            .Setup(x => x.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { model });
        _mockThumbnailRepository
            .Setup(x => x.GetByModelVersionIdAsync(10, It.IsAny<CancellationToken>()))
            .ReturnsAsync(orphaned);

        var result = await _handler.Handle(new RegenerateAllThumbnailsCommand(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        _mockModelVersionRepository.Verify(
            x => x.SetThumbnailIdAsync(10, 42, It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task Handle_DoesNotSetThumbnailIdAgain_WhenFkAlreadyLinked()
    {
        var model = BuildModelWithActiveVersionAndFile(modelId: 1, versionId: 10, hash: ValidHash);
        var existing = Thumbnail.Create(1, 10, DateTime.UtcNow).WithId(42);
        model.ActiveVersion!.SetThumbnail(existing); // FK already set to 42

        _mockModelRepository
            .Setup(x => x.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { model });
        _mockThumbnailRepository
            .Setup(x => x.GetByModelVersionIdAsync(10, It.IsAny<CancellationToken>()))
            .ReturnsAsync(existing);

        await _handler.Handle(new RegenerateAllThumbnailsCommand(), CancellationToken.None);

        _mockModelVersionRepository.Verify(
            x => x.SetThumbnailIdAsync(It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_CreatesAndLinksThumbnail_WhenNoneExists()
    {
        var model = BuildModelWithActiveVersionAndFile(modelId: 1, versionId: 10, hash: ValidHash);

        _mockModelRepository
            .Setup(x => x.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { model });
        _mockThumbnailRepository
            .Setup(x => x.GetByModelVersionIdAsync(10, It.IsAny<CancellationToken>()))
            .ReturnsAsync((Thumbnail?)null);
        _mockThumbnailRepository
            .Setup(x => x.AddAsync(It.IsAny<Thumbnail>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Thumbnail t, CancellationToken _) => t.WithId(77));

        await _handler.Handle(new RegenerateAllThumbnailsCommand(), CancellationToken.None);

        _mockThumbnailRepository.Verify(
            x => x.AddAsync(It.IsAny<Thumbnail>(), It.IsAny<CancellationToken>()),
            Times.Once);
        _mockModelVersionRepository.Verify(
            x => x.SetThumbnailIdAsync(10, 77, It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task Handle_NeverCallsModelRepositoryUpdateAsync_ToAvoidGraphTrackingConflicts()
    {
        // Guards against the EF tracking exception caused by calling
        // _modelRepository.UpdateAsync(model) in a loop — shared related
        // entities across iterations cause IdentityMap conflicts. The fix
        // uses the targeted IModelVersionRepository.SetThumbnailIdAsync.
        var modelA = BuildModelWithActiveVersionAndFile(1, 10, ValidHash);
        var modelB = BuildModelWithActiveVersionAndFile(2, 20, ValidHash);

        _mockModelRepository
            .Setup(x => x.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { modelA, modelB });
        _mockThumbnailRepository
            .Setup(x => x.GetByModelVersionIdAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Thumbnail?)null);
        _mockThumbnailRepository
            .Setup(x => x.AddAsync(It.IsAny<Thumbnail>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Thumbnail t, CancellationToken _) => t.WithId(t.ModelVersionId + 100));

        await _handler.Handle(new RegenerateAllThumbnailsCommand(), CancellationToken.None);

        _mockModelRepository.Verify(
            x => x.UpdateAsync(It.IsAny<Model>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_ProcessesMultipleModelsAndCountsEnqueuedAccurately()
    {
        var modelWithFile = BuildModelWithActiveVersionAndFile(1, 10, ValidHash);
        var anotherModel = BuildModelWithActiveVersionAndFile(2, 20, ValidHash);
        var noFilesModel = Model.Create("Empty", DateTime.UtcNow).WithId(3);
        noFilesModel.CreateVersion("v1", DateTime.UtcNow).WithId(30);

        _mockModelRepository
            .Setup(x => x.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new[] { modelWithFile, anotherModel, noFilesModel });
        _mockThumbnailRepository
            .Setup(x => x.GetByModelVersionIdAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Thumbnail?)null);
        _mockThumbnailRepository
            .Setup(x => x.AddAsync(It.IsAny<Thumbnail>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Thumbnail t, CancellationToken _) => t.WithId(t.ModelVersionId));

        var result = await _handler.Handle(new RegenerateAllThumbnailsCommand(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Value.EnqueuedCount);
        Assert.Equal(1, result.Value.SkippedCount);
        _mockThumbnailQueue.Verify(
            x => x.EnqueueAsync(It.IsAny<int>(), It.IsAny<int>(), It.IsAny<string>(), true, It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()),
            Times.Exactly(2));
    }
}
