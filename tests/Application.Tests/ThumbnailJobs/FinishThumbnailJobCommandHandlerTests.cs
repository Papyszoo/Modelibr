using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.ThumbnailJobs;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Microsoft.Extensions.Logging;
using Moq;
using SharedKernel;
using Xunit;

namespace Application.Tests.ThumbnailJobs;

public class FinishThumbnailJobCommandHandlerTests
{
    private readonly Mock<IThumbnailJobRepository> _mockThumbnailJobRepository;
    private readonly Mock<IModelRepository> _mockModelRepository;
    private readonly Mock<IThumbnailRepository> _mockThumbnailRepository;
    private readonly Mock<IThumbnailQueue> _mockThumbnailQueue;
    private readonly Mock<IDateTimeProvider> _mockDateTimeProvider;
    private readonly Mock<IDomainEventDispatcher> _mockDomainEventDispatcher;
    private readonly Mock<ILogger<FinishThumbnailJobCommandHandler>> _mockLogger;
    private readonly FinishThumbnailJobCommandHandler _handler;

    public FinishThumbnailJobCommandHandlerTests()
    {
        _mockThumbnailJobRepository = new Mock<IThumbnailJobRepository>();
        _mockModelRepository = new Mock<IModelRepository>();
        _mockThumbnailRepository = new Mock<IThumbnailRepository>();
        _mockThumbnailQueue = new Mock<IThumbnailQueue>();
        _mockDateTimeProvider = new Mock<IDateTimeProvider>();
        _mockDomainEventDispatcher = new Mock<IDomainEventDispatcher>();
        _mockLogger = new Mock<ILogger<FinishThumbnailJobCommandHandler>>();
        
        // Setup domain event dispatcher to return success
        _mockDomainEventDispatcher.Setup(x => x.PublishAsync(It.IsAny<IEnumerable<IDomainEvent>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success());
        
        _handler = new FinishThumbnailJobCommandHandler(
            _mockThumbnailJobRepository.Object,
            _mockModelRepository.Object,
            _mockThumbnailRepository.Object,
            _mockThumbnailQueue.Object,
            _mockDateTimeProvider.Object,
            _mockDomainEventDispatcher.Object,
            _mockLogger.Object);
    }

    [Fact]
    public async Task Handle_WhenJobNotFound_ReturnsFailure()
    {
        // Arrange
        var command = new FinishThumbnailJobCommand(1, true, "/path/thumb.jpg", 1024, 100, 100, null);
        _mockThumbnailJobRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync((ThumbnailJob?)null);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal("ThumbnailJobNotFound", result.Error.Code);
    }

    [Fact]
    public async Task Handle_WhenModelNotFound_ReturnsFailure()
    {
        // Arrange
        var command = new FinishThumbnailJobCommand(1, true, "/path/thumb.jpg", 1024, 100, 100, null);
        var validHash = "a".PadRight(64, '0'); // Valid SHA256 hash (64 chars)
        var job = ThumbnailJob.Create(1, 10, validHash, DateTime.UtcNow, 3, 10);
        
        _mockThumbnailJobRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(job);
        _mockModelRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync((Model?)null);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal("ModelNotFound", result.Error.Code);
    }

    [Fact]
    public async Task Handle_WhenThumbnailDoesNotExist_CreatesNewThumbnail()
    {
        // Arrange
        var command = new FinishThumbnailJobCommand(1, true, "/path/thumb.jpg", 1024, 100, 100, null);
        var validHash = "a".PadRight(64, '0'); // Valid SHA256 hash (64 chars)
        var job = ThumbnailJob.Create(1, 10, validHash, DateTime.UtcNow, 3, 10);
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var now = DateTime.UtcNow;
        var newThumbnail = Thumbnail.Create(10, now);

        _mockThumbnailJobRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(job);
        _mockModelRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(model);
        _mockThumbnailRepository.Setup(x => x.GetByModelVersionIdAsync(10, It.IsAny<CancellationToken>()))
            .ReturnsAsync((Thumbnail?)null);
        _mockThumbnailRepository.Setup(x => x.AddAsync(It.IsAny<Thumbnail>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(newThumbnail);
        _mockDateTimeProvider.Setup(x => x.UtcNow).Returns(now);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value.ModelId);
        Assert.Equal(ThumbnailStatus.Ready, result.Value.Status);

        // Verify that AddAsync was called for new thumbnail
        _mockThumbnailRepository.Verify(x => x.AddAsync(It.IsAny<Thumbnail>(), It.IsAny<CancellationToken>()), Times.Once);
        _mockThumbnailRepository.Verify(x => x.UpdateAsync(It.IsAny<Thumbnail>(), It.IsAny<CancellationToken>()), Times.Once);
        _mockThumbnailQueue.Verify(x => x.MarkCompletedAsync(1, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenThumbnailExists_UpdatesExistingThumbnail()
    {
        // Arrange
        var command = new FinishThumbnailJobCommand(1, true, "/path/thumb.jpg", 1024, 100, 100, null);
        var validHash = "a".PadRight(64, '0'); // Valid SHA256 hash (64 chars)
        var job = ThumbnailJob.Create(1, 10, validHash, DateTime.UtcNow, 3, 10);
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var existingThumbnail = Thumbnail.Create(10, DateTime.UtcNow.AddMinutes(-10));
        var now = DateTime.UtcNow;

        _mockThumbnailJobRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(job);
        _mockModelRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(model);
        _mockThumbnailRepository.Setup(x => x.GetByModelVersionIdAsync(10, It.IsAny<CancellationToken>()))
            .ReturnsAsync(existingThumbnail);
        _mockDateTimeProvider.Setup(x => x.UtcNow).Returns(now);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value.ModelId);
        Assert.Equal(ThumbnailStatus.Ready, result.Value.Status);

        // Verify that AddAsync was NOT called and only UpdateAsync was called
        _mockThumbnailRepository.Verify(x => x.AddAsync(It.IsAny<Thumbnail>(), It.IsAny<CancellationToken>()), Times.Never);
        _mockThumbnailRepository.Verify(x => x.UpdateAsync(It.IsAny<Thumbnail>(), It.IsAny<CancellationToken>()), Times.Once);
        _mockThumbnailQueue.Verify(x => x.MarkCompletedAsync(1, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenSuccessWithoutThumbnailPath_ReturnsInvalidCommand()
    {
        // Arrange
        var command = new FinishThumbnailJobCommand(1, true, null, null, null, null, null);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal("InvalidCommand", result.Error.Code);
    }

    [Fact]
    public async Task Handle_WhenFailureWithoutErrorMessage_ReturnsInvalidCommand()
    {
        // Arrange
        var command = new FinishThumbnailJobCommand(1, false, null, null, null, null, null);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal("InvalidCommand", result.Error.Code);
    }

    [Fact]
    public async Task Handle_WhenFailure_MarksThumbnailAsFailed()
    {
        // Arrange
        var command = new FinishThumbnailJobCommand(1, false, null, null, null, null, "Rendering failed");
        var validHash = "a".PadRight(64, '0'); // Valid SHA256 hash (64 chars)
        var job = ThumbnailJob.Create(1, 10, validHash, DateTime.UtcNow, 3, 10);
        var model = Model.Create("Test Model", DateTime.UtcNow);
        var existingThumbnail = Thumbnail.Create(10, DateTime.UtcNow.AddMinutes(-10));
        var now = DateTime.UtcNow;

        _mockThumbnailJobRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(job);
        _mockModelRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(model);
        _mockThumbnailRepository.Setup(x => x.GetByModelVersionIdAsync(10, It.IsAny<CancellationToken>()))
            .ReturnsAsync(existingThumbnail);
        _mockDateTimeProvider.Setup(x => x.UtcNow).Returns(now);

        // Act
        var result = await _handler.Handle(command, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(ThumbnailStatus.Failed, result.Value.Status);
        _mockThumbnailQueue.Verify(x => x.MarkFailedAsync(1, "Rendering failed", It.IsAny<CancellationToken>()), Times.Once);
    }
}