using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Models;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Moq;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Application.Tests.Models;

public class SetDefaultTextureSetCommandHandlerTests
{
    private readonly Mock<IModelRepository> _mockModelRepository;
    private readonly Mock<IModelVersionRepository> _mockModelVersionRepository;
    private readonly Mock<IThumbnailRepository> _mockThumbnailRepository;
    private readonly Mock<IThumbnailQueue> _mockThumbnailQueue;
    private readonly Mock<IDateTimeProvider> _mockDateTimeProvider;
    private readonly SetDefaultTextureSetCommandHandler _handler;

    public SetDefaultTextureSetCommandHandlerTests()
    {
        _mockModelRepository = new Mock<IModelRepository>();
        _mockModelVersionRepository = new Mock<IModelVersionRepository>();
        _mockThumbnailRepository = new Mock<IThumbnailRepository>();
        _mockThumbnailQueue = new Mock<IThumbnailQueue>();
        _mockDateTimeProvider = new Mock<IDateTimeProvider>();
        
        _handler = new SetDefaultTextureSetCommandHandler(
            _mockModelRepository.Object,
            _mockModelVersionRepository.Object,
            _mockThumbnailRepository.Object,
            _mockThumbnailQueue.Object,
            _mockDateTimeProvider.Object);
    }

    [Fact]
    public async Task Handle_WhenModelNotFound_ReturnsFailure()
    {
        // Arrange
        var command = new SetDefaultTextureSetCommand(999, 1);
        _mockModelRepository.Setup(x => x.GetByIdAsync(999, It.IsAny<CancellationToken>()))
            .ReturnsAsync((Model?)null);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal("ModelNotFound", result.Error.Code);
    }

    [Fact]
    public async Task Handle_WithoutModelVersionId_UpdatesActiveVersionAndModelDefaultTextureSet()
    {
        // Arrange
        var now = DateTime.UtcNow;
        _mockDateTimeProvider.Setup(x => x.UtcNow).Returns(now);
        
        var model = CreateModelWithActiveVersion(1, 1);
        var textureSet = CreateTextureSet(1, "Test Texture Set");
        model.ActiveVersion!.AddTextureSet(textureSet, now);
        
        var command = new SetDefaultTextureSetCommand(1, 1);
        
        _mockModelRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(model);
        _mockModelRepository.Setup(x => x.UpdateAsync(It.IsAny<Model>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        _mockModelVersionRepository.Setup(x => x.UpdateAsync(It.IsAny<ModelVersion>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ModelVersion mv, CancellationToken ct) => mv);
        _mockThumbnailQueue.Setup(x => x.CancelActiveJobsForModelAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(0);
        _mockThumbnailQueue.Setup(x => x.GetJobByModelHashAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ThumbnailJob?)null);
        _mockThumbnailQueue.Setup(x => x.EnqueueAsync(
                It.IsAny<int>(),
                It.IsAny<int>(),
                It.IsAny<string>(),
                It.IsAny<int>(),
                It.IsAny<int>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(ThumbnailJob.Create(1, 1, "a" + new string('0', 63), DateTime.UtcNow));

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value.DefaultTextureSetId);
        
        // Verify model version was updated
        Assert.Equal(1, model.ActiveVersion!.DefaultTextureSetId);
        _mockModelVersionRepository.Verify(
            x => x.UpdateAsync(It.IsAny<ModelVersion>(), It.IsAny<CancellationToken>()), 
            Times.Once);
        
        // Verify model default was NOT updated (each version has independent default)
        Assert.Null(model.DefaultTextureSetId);
        _mockModelRepository.Verify(
            x => x.UpdateAsync(It.IsAny<Model>(), It.IsAny<CancellationToken>()), 
            Times.Never);
    }

    [Fact]
    public async Task Handle_WithModelVersionId_UpdatesSpecifiedVersionAndModelDefaultIfActiveVersion()
    {
        // Arrange
        var now = DateTime.UtcNow;
        _mockDateTimeProvider.Setup(x => x.UtcNow).Returns(now);
        
        var model = CreateModelWithActiveVersion(1, 1);
        var version = model.ActiveVersion!;
        var textureSet = CreateTextureSet(1, "Test Texture Set");
        version.AddTextureSet(textureSet, now);
        
        var command = new SetDefaultTextureSetCommand(1, 1, 1);
        
        _mockModelRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(model);
        _mockModelVersionRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(version);
        _mockModelRepository.Setup(x => x.UpdateAsync(It.IsAny<Model>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        _mockModelVersionRepository.Setup(x => x.UpdateAsync(It.IsAny<ModelVersion>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ModelVersion mv, CancellationToken ct) => mv);
        _mockThumbnailQueue.Setup(x => x.CancelActiveJobsForModelAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(0);
        _mockThumbnailQueue.Setup(x => x.GetJobByModelHashAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ThumbnailJob?)null);
        _mockThumbnailQueue.Setup(x => x.EnqueueAsync(
                It.IsAny<int>(),
                It.IsAny<int>(),
                It.IsAny<string>(),
                It.IsAny<int>(),
                It.IsAny<int>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(ThumbnailJob.Create(1, 1, "a" + new string('0', 63), DateTime.UtcNow));

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value.DefaultTextureSetId);
        Assert.Equal(1, version.DefaultTextureSetId);
        
        // Verify model default was NOT updated (each version has independent default)
        Assert.Null(model.DefaultTextureSetId);
        
        _mockModelVersionRepository.Verify(
            x => x.UpdateAsync(It.IsAny<ModelVersion>(), It.IsAny<CancellationToken>()), 
            Times.Once);
        _mockModelRepository.Verify(
            x => x.UpdateAsync(It.IsAny<Model>(), It.IsAny<CancellationToken>()), 
            Times.Never);
    }

    [Fact]
    public async Task Handle_WithNonActiveVersion_UpdatesVersionButNotModel()
    {
        // Arrange
        var now = DateTime.UtcNow;
        _mockDateTimeProvider.Setup(x => x.UtcNow).Returns(now);
        
        var model = CreateModelWithActiveVersion(1, 1);
        var version2 = CreateModelVersion(1, 2);
        var textureSet = CreateTextureSet(1, "Test Texture Set");
        version2.AddTextureSet(textureSet, now);
        
        var command = new SetDefaultTextureSetCommand(1, 1, 2);
        
        _mockModelRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(model);
        _mockModelVersionRepository.Setup(x => x.GetByIdAsync(2, It.IsAny<CancellationToken>()))
            .ReturnsAsync(version2);
        _mockModelVersionRepository.Setup(x => x.UpdateAsync(It.IsAny<ModelVersion>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ModelVersion mv, CancellationToken ct) => mv);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(1, version2.DefaultTextureSetId);
        
        // Model default should NOT be updated since this is not the active version
        Assert.Null(model.DefaultTextureSetId);
        
        _mockModelVersionRepository.Verify(
            x => x.UpdateAsync(It.IsAny<ModelVersion>(), It.IsAny<CancellationToken>()), 
            Times.Once);
        _mockModelRepository.Verify(
            x => x.UpdateAsync(It.IsAny<Model>(), It.IsAny<CancellationToken>()), 
            Times.Never);
    }

    [Fact]
    public async Task Handle_WithTextureSetNotAssociatedWithVersion_ReturnsFailure()
    {
        // Arrange
        var now = DateTime.UtcNow;
        _mockDateTimeProvider.Setup(x => x.UtcNow).Returns(now);
        
        var model = CreateModelWithActiveVersion(1, 1);
        var command = new SetDefaultTextureSetCommand(1, 999); // Texture set not associated
        
        _mockModelRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(model);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal("InvalidTextureSet", result.Error.Code);
    }

    [Fact]
    public async Task Handle_ClearingDefault_UpdatesBothModelAndVersion()
    {
        // Arrange
        var now = DateTime.UtcNow;
        _mockDateTimeProvider.Setup(x => x.UtcNow).Returns(now);
        
        var model = CreateModelWithActiveVersion(1, 1);
        var textureSet = CreateTextureSet(1, "Test Texture Set");
        model.ActiveVersion!.AddTextureSet(textureSet, now);
        model.ActiveVersion.SetDefaultTextureSet(1, now);
        model.SyncDefaultTextureSetFromActiveVersion(1, now);
        
        var command = new SetDefaultTextureSetCommand(1, null); // Clear default
        
        _mockModelRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(model);
        _mockModelRepository.Setup(x => x.UpdateAsync(It.IsAny<Model>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        _mockModelVersionRepository.Setup(x => x.UpdateAsync(It.IsAny<ModelVersion>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ModelVersion mv, CancellationToken ct) => mv);
        _mockThumbnailQueue.Setup(x => x.CancelActiveJobsForModelAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(0);
        _mockThumbnailQueue.Setup(x => x.GetJobByModelHashAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ThumbnailJob?)null);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Null(result.Value.DefaultTextureSetId);
        Assert.Null(model.ActiveVersion.DefaultTextureSetId);
        
        // Model default should remain as set (version defaults are independent)
        Assert.Equal(1, model.DefaultTextureSetId);
    }

    private Model CreateModelWithActiveVersion(int modelId, int versionId)
    {
        var model = Model.Create("Test Model", DateTime.UtcNow);
        SetId(model, modelId);
        
        var version = ModelVersion.Create(modelId, 1, "Version 1", DateTime.UtcNow);
        SetId(version, versionId);
        
        var file = DomainFile.Create(
            "test.blend",
            "stored.blend",
            "/path/to/stored.blend",
            "application/x-blender",
            FileType.Blend,
            1024,
            "a" + new string('0', 63),
            DateTime.UtcNow);
        version.AddFile(file);
        
        // Use reflection to set the version on the model
        var versionsField = typeof(Model).GetField("_versions", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
        var versionsList = (List<ModelVersion>)versionsField!.GetValue(model)!;
        versionsList.Add(version);
        
        model.SetActiveVersion(version.Id, DateTime.UtcNow);
        
        return model;
    }

    private ModelVersion CreateModelVersion(int modelId, int versionId)
    {
        var version = ModelVersion.Create(modelId, versionId, $"Version {versionId}", DateTime.UtcNow);
        SetId(version, versionId);
        return version;
    }

    private TextureSet CreateTextureSet(int id, string name)
    {
        var textureSet = TextureSet.Create(name, DateTime.UtcNow);
        SetId(textureSet, id);
        return textureSet;
    }

    private void SetId<T>(T entity, int id) where T : class
    {
        var idProperty = typeof(T).GetProperty("Id");
        idProperty!.SetValue(entity, id);
    }
}
