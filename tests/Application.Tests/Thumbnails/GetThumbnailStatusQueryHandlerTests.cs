using Application.Abstractions.Repositories;
using Application.Thumbnails;
using Application.Tests;
using Domain.Models;
using Domain.ValueObjects;
using Moq;
using SharedKernel;
using Xunit;

namespace Application.Tests.Thumbnails;

public class GetThumbnailStatusQueryHandlerTests
{
    private readonly Mock<IModelRepository> _mockModelRepository;
    private readonly GetThumbnailStatusQueryHandler _handler;

    public GetThumbnailStatusQueryHandlerTests()
    {
        _mockModelRepository = new Mock<IModelRepository>();
        _handler = new GetThumbnailStatusQueryHandler(_mockModelRepository.Object);
    }

    [Fact]
    public async Task Handle_WhenModelNotFound_ReturnsFailure()
    {
        // Arrange
        var query = new GetThumbnailStatusQuery(1);
        _mockModelRepository.Setup(x => x.GetThumbnailDataAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(((int? ActiveVersionId, Thumbnail? Thumbnail)?)null);

        // Act
        var result = await _handler.Handle(query, CancellationToken.None);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Equal("ModelNotFound", result.Error.Code);
    }

    [Fact]
    public async Task Handle_WhenModelHasNoActiveVersion_ReturnsPendingStatus()
    {
        // Arrange
        var query = new GetThumbnailStatusQuery(1);

        _mockModelRepository.Setup(x => x.GetThumbnailDataAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(((int?)null, (Thumbnail?)null));

        // Act
        var result = await _handler.Handle(query, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(ThumbnailStatus.Pending, result.Value.Status);
        Assert.Null(result.Value.ThumbnailPath);
    }

    [Fact]
    public async Task Handle_WhenActiveVersionHasReadyThumbnail_ReturnsCompleteStatus()
    {
        // Arrange
        var query = new GetThumbnailStatusQuery(1);
        var thumbnail = Thumbnail.Create(1, 10, DateTime.UtcNow);
        thumbnail.MarkAsReady("/path/to/thumbnail.png", 1024, 256, 256, DateTime.UtcNow);

        _mockModelRepository.Setup(x => x.GetThumbnailDataAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(((int?)10, thumbnail));

        // Act
        var result = await _handler.Handle(query, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal(ThumbnailStatus.Ready, result.Value.Status);
        Assert.Equal("/path/to/thumbnail.png", result.Value.ThumbnailPath);
        Assert.Equal(1024, result.Value.SizeBytes);
        Assert.Equal(256, result.Value.Width);
        Assert.Equal(256, result.Value.Height);
    }
}