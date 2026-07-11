using Application.Abstractions.Files;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Models;
using Application.Services;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Moq;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Application.Tests.Models;

/// <summary>
/// AddFileToVersionCommandHandler is where the asset-processor worker lands the .glb it
/// extracts from a Blender-saved version (see jobApiClient.uploadRenderableFile →
/// POST /models/{modelId}/versions/{versionId}/files). A version created by a Blender
/// save starts with only a .blend (non-renderable), so this is the moment
/// generated-{name}.blend first becomes generatable — these tests cover that it schedules
/// background generation exactly when a renderable file lands, and not otherwise.
/// </summary>
public class AddFileToVersionCommandHandlerTests
{
    private readonly Mock<IModelRepository> _mockModelRepository = new();
    private readonly Mock<IModelVersionRepository> _mockVersionRepository = new();
    private readonly Mock<IFileCreationService> _mockFileCreationService = new();
    private readonly Mock<IDateTimeProvider> _mockDateTimeProvider = new();
    private readonly Mock<IBlendFileGenerationQueue> _mockBlendFileGenerationQueue = new();
    private readonly AddFileToVersionCommandHandler _handler;

    public AddFileToVersionCommandHandlerTests()
    {
        _handler = new AddFileToVersionCommandHandler(
            _mockModelRepository.Object,
            _mockVersionRepository.Object,
            _mockFileCreationService.Object,
            _mockDateTimeProvider.Object,
            _mockBlendFileGenerationQueue.Object);
    }

    private void SetUpModelAndVersion(int modelId, int versionId)
    {
        var now = DateTime.UtcNow;
        var model = Model.Create("Chair", now);
        SetId(model, modelId);

        var version = ModelVersion.Create(modelId, 1, "v1", now);
        SetId(version, versionId);

        _mockModelRepository.Setup(r => r.GetByIdAsync(modelId, It.IsAny<CancellationToken>())).ReturnsAsync(model);
        _mockVersionRepository.Setup(r => r.GetByIdAsync(versionId, It.IsAny<CancellationToken>())).ReturnsAsync(version);
        _mockVersionRepository.Setup(r => r.UpdateAsync(It.IsAny<ModelVersion>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ModelVersion v, CancellationToken _) => v);
        _mockModelRepository.Setup(r => r.UpdateAsync(It.IsAny<Model>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
    }

    private static void SetId<T>(T entity, int id) where T : class
    {
        typeof(T).GetProperty("Id")!.SetValue(entity, id);
    }

    private static Mock<IFileUpload> CreateUpload(string fileName)
    {
        var upload = new Mock<IFileUpload>();
        upload.Setup(u => u.FileName).Returns(fileName);
        upload.Setup(u => u.Length).Returns(1024);
        return upload;
    }

    [Fact]
    public async Task Handle_RenderableFileAttached_EnqueuesBackgroundBlendGenerationExactlyOnce()
    {
        // Arrange — mirrors the worker attaching its extracted .glb to the version.
        const int modelId = 1;
        const int versionId = 10;
        SetUpModelAndVersion(modelId, versionId);

        var glbFile = DomainFile.Create(
            "chair.glb", "stored.glb", "aa/bb/hash1", "model/gltf-binary",
            FileType.Glb, sizeBytes: 2048, sha256Hash: "a" + new string('0', 63), createdAt: DateTime.UtcNow);

        _mockFileCreationService
            .Setup(s => s.CreateOrGetExistingFileAsync(It.IsAny<IFileUpload>(), It.Is<FileType>(ft => ft == FileType.Glb), It.IsAny<CancellationToken>()))
            .ReturnsAsync(SharedKernel.Result.Success(glbFile));

        var command = new AddFileToVersionCommand(modelId, versionId, CreateUpload("chair.glb").Object);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        _mockBlendFileGenerationQueue.Verify(q => q.Enqueue(modelId, versionId), Times.Once);
    }

    [Fact]
    public async Task Handle_NonRenderableFileAttached_DoesNotEnqueueBlendGeneration()
    {
        // Arrange — attaching a .blend (or any non-renderable project file) shouldn't
        // schedule generation: GetOrGenerateAsync needs a renderable file to work from,
        // and a .blend attach doesn't provide one.
        const int modelId = 1;
        const int versionId = 10;
        SetUpModelAndVersion(modelId, versionId);

        var blendFile = DomainFile.Create(
            "chair.blend", "stored.blend", "aa/bb/hash2", "application/x-blender",
            FileType.Blend, sizeBytes: 4096, sha256Hash: "b" + new string('0', 63), createdAt: DateTime.UtcNow);

        _mockFileCreationService
            .Setup(s => s.CreateOrGetExistingFileAsync(It.IsAny<IFileUpload>(), It.Is<FileType>(ft => ft == FileType.Blend), It.IsAny<CancellationToken>()))
            .ReturnsAsync(SharedKernel.Result.Success(blendFile));

        var command = new AddFileToVersionCommand(modelId, versionId, CreateUpload("chair.blend").Object);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        _mockBlendFileGenerationQueue.Verify(q => q.Enqueue(It.IsAny<int>(), It.IsAny<int>()), Times.Never);
    }

    [Fact]
    public async Task Handle_ModelNotFound_DoesNotEnqueueBlendGeneration()
    {
        _mockModelRepository.Setup(r => r.GetByIdAsync(999, It.IsAny<CancellationToken>())).ReturnsAsync((Model?)null);

        var command = new AddFileToVersionCommand(999, 1, CreateUpload("chair.glb").Object);

        var result = await _handler.Handle(command, CancellationToken.None);

        Assert.False(result.IsSuccess);
        _mockBlendFileGenerationQueue.Verify(q => q.Enqueue(It.IsAny<int>(), It.IsAny<int>()), Times.Never);
    }
}
