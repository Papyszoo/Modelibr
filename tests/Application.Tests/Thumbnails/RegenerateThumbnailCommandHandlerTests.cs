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

public class RegenerateThumbnailCommandHandlerTests
{
    private readonly Mock<IModelRepository> _mockModelRepository;
    private readonly Mock<IThumbnailRepository> _mockThumbnailRepository;
    private readonly Mock<IThumbnailQueue> _mockThumbnailQueue;
    private readonly Mock<IDateTimeProvider> _mockDateTimeProvider;
    private readonly RegenerateThumbnailCommandHandler _handler;

    private const string ValidHash = "a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd";

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
    public async Task Handle_WhenModelHasNoActiveVersion_ReturnsFailure()
    {
        // Arrange
        var command = new RegenerateThumbnailCommand(1);
        var model = Model.Create("Test Model", DateTime.UtcNow);
        // Model has no versions (no active version)
        
        _mockModelRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(model);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal("NoActiveVersion", result.Error.Code);
    }

    private Model CreateModelWithActiveVersionAndFile(string fileName, string hash)
    {
        var model = Model.Create("Test Model", DateTime.UtcNow);
        model.WithId(1);
        
        var version = model.CreateVersion("v1", DateTime.UtcNow);
        version.WithId(1);
        var file = Domain.Models.File.Create(
            fileName, 
            "stored-file.obj",
            "/path/to/file", 
            "model/obj", 
            FileType.Obj, 
            1024, 
            hash,
            DateTime.UtcNow);
        
        version.AddFile(file);
        return model;
    }

    [Fact]
    public async Task Handle_WhenActiveVersionHasExistingThumbnail_ResetsAndEnqueuesJob()
    {
        // Arrange
        var command = new RegenerateThumbnailCommand(1);
        var model = CreateModelWithActiveVersionAndFile("test.obj", ValidHash);
        
        var thumbnail = Thumbnail.Create(model.ActiveVersion!.Id, DateTime.UtcNow);
        thumbnail.MarkAsReady("/old/path.png", 512, 128, 128, DateTime.UtcNow);
        model.ActiveVersion!.SetThumbnail(thumbnail);

        var currentTime = DateTime.UtcNow;
        
        _mockModelRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(model);
        _mockDateTimeProvider.Setup(x => x.UtcNow).Returns(currentTime);
        _mockThumbnailQueue.Setup(x => x.GetJobByModelHashAsync(ValidHash, It.IsAny<CancellationToken>()))
            .ReturnsAsync((ThumbnailJob?)null);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value.ModelId);
        
        // Verify thumbnail was reset
        _mockThumbnailRepository.Verify(x => x.UpdateAsync(thumbnail, It.IsAny<CancellationToken>()), Times.Once);
        
        // Verify new job was enqueued
        _mockThumbnailQueue.Verify(x => x.EnqueueAsync(1, model.ActiveVersion!.Id, ValidHash, It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenModelHasExistingJob_EnqueuesNewJob()
    {
        // Arrange
        var command = new RegenerateThumbnailCommand(1);
        var model = CreateModelWithActiveVersionAndFile("test.obj", ValidHash);
        
        var thumbnail = Thumbnail.Create(model.ActiveVersion!.Id, DateTime.UtcNow);
        model.ActiveVersion!.SetThumbnail(thumbnail);

        var existingJob = ThumbnailJob.Create(1, model.ActiveVersion!.Id, ValidHash, DateTime.UtcNow);
        var currentTime = DateTime.UtcNow;
        
        _mockModelRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(model);
        _mockDateTimeProvider.Setup(x => x.UtcNow).Returns(currentTime);
        _mockThumbnailQueue.Setup(x => x.GetJobByModelHashAsync(ValidHash, It.IsAny<CancellationToken>()))
            .ReturnsAsync(existingJob);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value.ModelId);
        
        // Verify thumbnail was reset
        _mockThumbnailRepository.Verify(x => x.UpdateAsync(thumbnail, It.IsAny<CancellationToken>()), Times.Once);
        
        // EnqueueAsync is called which handles deduplication internally
        _mockThumbnailQueue.Verify(x => x.EnqueueAsync(1, model.ActiveVersion!.Id, ValidHash, It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenActiveVersionHasNoThumbnail_CreatesNewThumbnailAndEnqueuesJob()
    {
        // Arrange
        var command = new RegenerateThumbnailCommand(1);
        var model = CreateModelWithActiveVersionAndFile("test.obj", ValidHash);
        // ActiveVersion.Thumbnail is null by default

        var currentTime = DateTime.UtcNow;
        var newThumbnail = Thumbnail.Create(model.ActiveVersion!.Id, currentTime);
        
        _mockModelRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(model);
        _mockDateTimeProvider.Setup(x => x.UtcNow).Returns(currentTime);
        _mockThumbnailRepository.Setup(x => x.AddAsync(It.IsAny<Thumbnail>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(newThumbnail);
        _mockThumbnailQueue.Setup(x => x.GetJobByModelHashAsync(ValidHash, It.IsAny<CancellationToken>()))
            .ReturnsAsync((ThumbnailJob?)null);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value.ModelId);
        
        // Verify new thumbnail was created
        _mockThumbnailRepository.Verify(x => x.AddAsync(It.IsAny<Thumbnail>(), It.IsAny<CancellationToken>()), Times.Once);
        
        // Verify new job was enqueued
        _mockThumbnailQueue.Verify(x => x.EnqueueAsync(1, model.ActiveVersion!.Id, ValidHash, It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Once);
    }
}