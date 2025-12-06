using Application.Abstractions.Repositories;
using Application.Models;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Moq;
using Xunit;
using DomainFile = Domain.Models.File;

namespace Application.Tests.Models;

public class SoftDeleteModelVersionCommandHandlerTests
{
    private readonly Mock<IModelRepository> _mockModelRepository;
    private readonly Mock<IModelVersionRepository> _mockModelVersionRepository;
    private readonly Mock<IDateTimeProvider> _mockDateTimeProvider;
    private readonly SoftDeleteModelVersionCommandHandler _handler;

    public SoftDeleteModelVersionCommandHandlerTests()
    {
        _mockModelRepository = new Mock<IModelRepository>();
        _mockModelVersionRepository = new Mock<IModelVersionRepository>();
        _mockDateTimeProvider = new Mock<IDateTimeProvider>();
        
        _handler = new SoftDeleteModelVersionCommandHandler(
            _mockModelRepository.Object,
            _mockModelVersionRepository.Object,
            _mockDateTimeProvider.Object);
    }

    [Fact]
    public async Task Handle_WhenModelNotFound_ReturnsFailure()
    {
        // Arrange
        var command = new SoftDeleteModelVersionCommand(1, 1);
        _mockModelRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync((Model?)null);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal("ModelNotFound", result.Error.Code);
    }

    [Fact]
    public async Task Handle_WhenVersionNotFound_ReturnsFailure()
    {
        // Arrange
        var command = new SoftDeleteModelVersionCommand(1, 999);
        var model = CreateModelWithVersion(1, 1);
        
        _mockModelRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(model);
        _mockModelVersionRepository.Setup(x => x.GetByIdAsync(999, It.IsAny<CancellationToken>()))
            .ReturnsAsync((ModelVersion?)null);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal("VersionNotFound", result.Error.Code);
    }

    [Fact]
    public async Task Handle_WhenVersionBelongsToDifferentModel_ReturnsFailure()
    {
        // Arrange
        var command = new SoftDeleteModelVersionCommand(1, 1);
        var model = CreateModelWithVersion(1, 1);
        var otherVersion = CreateModelVersion(2, 1); // Belongs to model 2
        
        _mockModelRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(model);
        _mockModelVersionRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(otherVersion);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal("VersionMismatch", result.Error.Code);
    }

    [Fact]
    public async Task Handle_WhenVersionIsNotActive_SoftDeletesVersion()
    {
        // Arrange
        var now = DateTime.UtcNow;
        var model = CreateModelWithMultipleVersions(1);
        var versionToDelete = model.Versions.First(v => v.VersionNumber == 1);
        var command = new SoftDeleteModelVersionCommand(1, versionToDelete.Id);
        
        _mockModelRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(model);
        _mockModelVersionRepository.Setup(x => x.GetByIdAsync(versionToDelete.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(versionToDelete);
        _mockDateTimeProvider.Setup(x => x.UtcNow).Returns(now);
        _mockModelVersionRepository.Setup(x => x.UpdateAsync(versionToDelete, It.IsAny<CancellationToken>()))
            .ReturnsAsync(versionToDelete);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.True(versionToDelete.IsDeleted);
        Assert.Equal(now, versionToDelete.DeletedAt);
        _mockModelVersionRepository.Verify(x => x.UpdateAsync(versionToDelete, It.IsAny<CancellationToken>()), Times.Once);
        _mockModelRepository.Verify(x => x.UpdateAsync(It.IsAny<Model>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WhenVersionIsActive_ChangesActiveVersionToLatest()
    {
        // Arrange
        var now = DateTime.UtcNow;
        var model = CreateModelWithMultipleVersions(1);
        var activeVersion = model.Versions.First(v => v.VersionNumber == 2);
        SetModelActiveVersion(model, activeVersion.Id);
        
        var command = new SoftDeleteModelVersionCommand(1, activeVersion.Id);
        
        var remainingVersions = new List<ModelVersion>
        {
            model.Versions.First(v => v.VersionNumber == 1)
        };
        
        _mockModelRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(model);
        _mockModelVersionRepository.Setup(x => x.GetByIdAsync(activeVersion.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(activeVersion);
        _mockDateTimeProvider.Setup(x => x.UtcNow).Returns(now);
        _mockModelVersionRepository.Setup(x => x.UpdateAsync(activeVersion, It.IsAny<CancellationToken>()))
            .ReturnsAsync(activeVersion);
        _mockModelVersionRepository.Setup(x => x.GetByModelIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(remainingVersions);
        _mockModelRepository.Setup(x => x.UpdateAsync(model, It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.True(activeVersion.IsDeleted);
        Assert.Equal(now, activeVersion.DeletedAt);
        Assert.NotEqual(activeVersion.Id, model.ActiveVersionId);
        Assert.Equal(remainingVersions.First().Id, model.ActiveVersionId);
        _mockModelVersionRepository.Verify(x => x.UpdateAsync(activeVersion, It.IsAny<CancellationToken>()), Times.Once);
        _mockModelRepository.Verify(x => x.UpdateAsync(model, It.IsAny<CancellationToken>()), Times.Once);
    }

    private static Model CreateModelWithVersion(int modelId, int versionNumber)
    {
        var model = Model.Create($"Test Model {modelId}", DateTime.UtcNow);
        typeof(Model).GetProperty("Id")!.SetValue(model, modelId);
        
        var version = model.CreateVersion($"Version {versionNumber}", DateTime.UtcNow);
        typeof(ModelVersion).GetProperty("Id")!.SetValue(version, versionNumber);
        
        return model;
    }

    private static Model CreateModelWithMultipleVersions(int modelId)
    {
        var model = Model.Create($"Test Model {modelId}", DateTime.UtcNow);
        typeof(Model).GetProperty("Id")!.SetValue(model, modelId);
        
        var version1 = model.CreateVersion("Version 1", DateTime.UtcNow);
        typeof(ModelVersion).GetProperty("Id")!.SetValue(version1, 1);
        
        var version2 = model.CreateVersion("Version 2", DateTime.UtcNow);
        typeof(ModelVersion).GetProperty("Id")!.SetValue(version2, 2);
        
        return model;
    }

    private static ModelVersion CreateModelVersion(int modelId, int versionNumber)
    {
        var version = ModelVersion.Create(modelId, versionNumber, $"Version {versionNumber}", DateTime.UtcNow);
        typeof(ModelVersion).GetProperty("Id")!.SetValue(version, versionNumber);
        return version;
    }

    private static void SetModelActiveVersion(Model model, int versionId)
    {
        typeof(Model).GetProperty("ActiveVersionId")!.SetValue(model, versionId);
        var version = model.Versions.First(v => v.Id == versionId);
        typeof(Model).GetProperty("ActiveVersion")!.SetValue(model, version);
    }
}
