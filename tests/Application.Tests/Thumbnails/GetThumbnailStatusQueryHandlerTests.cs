using Application.Abstractions.Repositories;
using Application.Thumbnails;
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
        _mockModelRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync((Model?)null);

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
        var model = Model.Create("Test Model", DateTime.UtcNow);
        // Model has no active version set

        _mockModelRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(model);

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
        var model = Model.Create("Test Model", DateTime.UtcNow);
        model.Id = 1;
        
        // Create a version with thumbnail
        var version = model.CreateVersion("v1", DateTime.UtcNow);
        var thumbnail = Thumbnail.Create(version.Id, DateTime.UtcNow);
        thumbnail.MarkAsReady("/path/to/thumbnail.png", 1024, 256, 256, DateTime.UtcNow);
        version.SetThumbnail(thumbnail);

        _mockModelRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(model);

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