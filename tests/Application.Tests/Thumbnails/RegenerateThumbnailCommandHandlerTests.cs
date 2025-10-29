using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Thumbnails;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Moq;
using SharedKernel;
using Xunit;

namespace Application.Tests.Thumbnails;

public class RegenerateThumbnailCommandHandlerTests
{
    private readonly Mock<IModelRepository> _mockModelRepository;
    private readonly Mock<IThumbnailRepository> _mockThumbnailRepository;
    private readonly Mock<IThumbnailQueue> _mockThumbnailQueue;
    private readonly Mock<IDateTimeProvider> _mockDateTimeProvider;
    private readonly RegenerateThumbnailCommandHandler _handler;

    public RegenerateThumbnailCommandHandlerTests()
    {
        _mockModelRepository = new Mock<IModelRepository>();
        _mockThumbnailRepository = new Mock<IThumbnailRepository>();
        _mockThumbnailQueue = new Mock<IThumbnailQueue>();
        _mockDateTimeProvider = new Mock<IDateTimeProvider>();
        
        _handler = new RegenerateThumbnailCommandHandler(
            _mockModelRepository.Object,
            _mockThumbnailRepository.Object,
            _mockThumbnailQueue.Object,
            _mockDateTimeProvider.Object);
    }

    [Fact]
    public async Task Handle_WhenModelNotFound_ReturnsFailure()
    {
        // Arrange
        var command = new RegenerateThumbnailCommand(1);
        _mockModelRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync((Model?)null);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal("ModelNotFound", result.Error.Code);
    }

    [Fact]
    public async Task Handle_WhenModelHasNoFiles_ReturnsFailure()
    {
        // Arrange
        var command = new RegenerateThumbnailCommand(1);
        var model = Model.Create("Test Model", DateTime.UtcNow);
        
        _mockModelRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(model);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal("NoFilesFound", result.Error.Code);
    }

    [Fact]
    public async Task Handle_WhenModelHasExistingThumbnail_ResetsAndEnqueuesJob()
    {
        // Arrange
        var command = new RegenerateThumbnailCommand(1);
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var file = Domain.Models.File.Create(
            "test.obj", 
            "stored-file.obj",
            "/path/to/file", 
            "model/obj", 
            FileType.Obj, 
            1024, 
            "sha256hash",
            DateTime.UtcNow);
        
        model.AddFile(file, DateTime.UtcNow);
        
        // Create a version for the model
        var version = model.CreateVersion("v1", DateTime.UtcNow);
        version.AddFile(file);
        
        var thumbnail = Thumbnail.Create(1, version.Id, DateTime.UtcNow);
        thumbnail.MarkAsReady("/old/path.png", 512, 128, 128, DateTime.UtcNow);
        version.Thumbnail = thumbnail;

        var currentTime = DateTime.UtcNow;
        
        _mockModelRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(model);
        _mockDateTimeProvider.Setup(x => x.UtcNow).Returns(currentTime);
        _mockThumbnailQueue.Setup(x => x.GetJobByModelVersionIdAsync(version.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync((ThumbnailJob?)null);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value.ModelId);
        
        // Verify thumbnail was reset
        _mockThumbnailRepository.Verify(x => x.UpdateAsync(thumbnail, It.IsAny<CancellationToken>()), Times.Once);
        
        // Verify new job was enqueued
        _mockThumbnailQueue.Verify(x => x.EnqueueAsync(1, version.Id, "sha256hash", It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenModelHasExistingJob_RetriesExistingJob()
    {
        // Arrange
        var command = new RegenerateThumbnailCommand(1);
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var file = Domain.Models.File.Create(
            "test.obj", 
            "stored-file.obj",
            "/path/to/file", 
            "model/obj", 
            FileType.Obj, 
            1024, 
            "sha256hash",
            DateTime.UtcNow);
        
        model.AddFile(file, DateTime.UtcNow);
        
        // Create a version for the model
        var version = model.CreateVersion("v1", DateTime.UtcNow);
        version.AddFile(file);
        
        var thumbnail = Thumbnail.Create(1, version.Id, DateTime.UtcNow);
        version.Thumbnail = thumbnail;

        var existingJob = ThumbnailJob.Create(1, version.Id, "sha256hash", DateTime.UtcNow);
        var currentTime = DateTime.UtcNow;
        
        _mockModelRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(model);
        _mockDateTimeProvider.Setup(x => x.UtcNow).Returns(currentTime);
        _mockThumbnailQueue.Setup(x => x.GetJobByModelVersionIdAsync(version.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(existingJob);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value.ModelId);
        
        // Verify thumbnail was reset
        _mockThumbnailRepository.Verify(x => x.UpdateAsync(thumbnail, It.IsAny<CancellationToken>()), Times.Once);
        
        // Verify existing job was retried (not a new job enqueued)
        _mockThumbnailQueue.Verify(x => x.RetryJobAsync(existingJob.Id, It.IsAny<CancellationToken>()), Times.Once);
        _mockThumbnailQueue.Verify(x => x.EnqueueAsync(It.IsAny<int>(), It.IsAny<int>(), It.IsAny<string>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WhenModelHasNoThumbnail_CreatesNewThumbnailAndEnqueuesJob()
    {
        // Arrange
        var command = new RegenerateThumbnailCommand(1);
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var file = Domain.Models.File.Create(
            "test.obj", 
            "stored-file.obj",
            "/path/to/file", 
            "model/obj", 
            FileType.Obj, 
            1024, 
            "sha256hash",
            DateTime.UtcNow);
        
        model.AddFile(file, DateTime.UtcNow);
        
        // Create a version for the model
        var version = model.CreateVersion("v1", DateTime.UtcNow);
        version.AddFile(file);
        version.Thumbnail = null;

        var currentTime = DateTime.UtcNow;
        var newThumbnail = Thumbnail.Create(1, version.Id, currentTime);
        
        _mockModelRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(model);
        _mockDateTimeProvider.Setup(x => x.UtcNow).Returns(currentTime);
        _mockThumbnailRepository.Setup(x => x.AddAsync(It.IsAny<Thumbnail>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(newThumbnail);
        _mockThumbnailQueue.Setup(x => x.GetJobByModelVersionIdAsync(version.Id, It.IsAny<CancellationToken>()))
            .ReturnsAsync((ThumbnailJob?)null);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value.ModelId);
        
        // Verify new thumbnail was created
        _mockThumbnailRepository.Verify(x => x.AddAsync(It.IsAny<Thumbnail>(), It.IsAny<CancellationToken>()), Times.Once);
        
        // Verify new job was enqueued
        _mockThumbnailQueue.Verify(x => x.EnqueueAsync(1, version.Id, "sha256hash", It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Once);
    }
}