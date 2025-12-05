using Application.Abstractions.Services;
using Application.EventHandlers;
using Domain.Events;
using Domain.Models;
using Microsoft.Extensions.Logging;
using Moq;
using SharedKernel;
using Xunit;

namespace Application.Tests.EventHandlers;

public class ModelUploadedEventHandlerTests
{
    [Fact]
    public async Task Handle_ValidEvent_EnqueuesJob()
    {
        // Arrange
        var mockThumbnailQueue = new Mock<IThumbnailQueue>();
        var mockLogger = new Mock<ILogger<ModelUploadedEventHandler>>();

        var job = ThumbnailJob.Create(1, 10, "test-hash", DateTime.UtcNow);
        mockThumbnailQueue.Setup(x => x.EnqueueAsync(
                It.IsAny<int>(),
                It.IsAny<int>(),
                It.IsAny<string>(),
                It.IsAny<int>(),
                It.IsAny<int>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(job);

        var handler = new ModelUploadedEventHandler(mockThumbnailQueue.Object, mockLogger.Object);
        var domainEvent = new ModelUploadedEvent(1, 10, "test-hash", true);

        // Act
        var result = await handler.Handle(domainEvent, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        mockThumbnailQueue.Verify(x => x.EnqueueAsync(
            1,
            10,
            "test-hash",
            It.IsAny<int>(),
            It.IsAny<int>(),
            CancellationToken.None), Times.Once);
    }

    [Fact]
    public async Task Handle_EnqueueThrowsException_ReturnsFailure()
    {
        // Arrange
        var mockThumbnailQueue = new Mock<IThumbnailQueue>();
        var mockLogger = new Mock<ILogger<ModelUploadedEventHandler>>();

        mockThumbnailQueue.Setup(x => x.EnqueueAsync(
                It.IsAny<int>(),
                It.IsAny<int>(),
                It.IsAny<string>(),
                It.IsAny<int>(),
                It.IsAny<int>(),
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new Exception("Test exception"));

        var handler = new ModelUploadedEventHandler(mockThumbnailQueue.Object, mockLogger.Object);
        var domainEvent = new ModelUploadedEvent(1, 10, "test-hash", true);

        // Act
        var result = await handler.Handle(domainEvent, CancellationToken.None);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Contains("Failed to enqueue thumbnail job", result.Error.Message);
    }
}