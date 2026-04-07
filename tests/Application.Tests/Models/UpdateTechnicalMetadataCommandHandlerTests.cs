using Application.Abstractions.Repositories;
using Application.Models;
using Domain.Models;
using Domain.Services;
using Moq;
using Xunit;

namespace Application.Tests.Models;

public class UpdateTechnicalMetadataCommandHandlerTests
{
    private readonly Mock<IModelVersionRepository> _mockModelVersionRepository;
    private readonly Mock<IDateTimeProvider> _mockDateTimeProvider;
    private readonly UpdateTechnicalMetadataCommandHandler _handler;

    public UpdateTechnicalMetadataCommandHandlerTests()
    {
        _mockModelVersionRepository = new Mock<IModelVersionRepository>();
        _mockDateTimeProvider = new Mock<IDateTimeProvider>();
        _mockDateTimeProvider.Setup(x => x.UtcNow).Returns(new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));

        _handler = new UpdateTechnicalMetadataCommandHandler(
            _mockModelVersionRepository.Object,
            _mockDateTimeProvider.Object);
    }

    [Fact]
    public async Task Handle_WhenVersionNotFound_ReturnsFailure()
    {
        var command = new UpdateTechnicalMetadataCommand(999, new List<string> { "Mat1" }, 100, 50, 3, 1);
        _mockModelVersionRepository.Setup(x => x.GetByIdAsync(999, It.IsAny<CancellationToken>()))
            .ReturnsAsync((ModelVersion?)null);

        var result = await _handler.Handle(command, CancellationToken.None);

        Assert.False(result.IsSuccess);
        Assert.Equal("ModelVersionNotFound", result.Error.Code);
    }

    [Fact]
    public async Task Handle_WhenVersionExists_UpdatesMetadataAndReturnsSuccess()
    {
        var version = ModelVersion.Create(1, 1, "v1", DateTime.UtcNow);
        version.WithId(1);

        _mockModelVersionRepository.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>()))
            .ReturnsAsync(version);
        _mockModelVersionRepository.Setup(x => x.UpdateAsync(It.IsAny<ModelVersion>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ModelVersion mv, CancellationToken _) => mv);

        var command = new UpdateTechnicalMetadataCommand(1, new List<string> { "Metal", "Wood" }, 1200, 600, 5, 2);

        var result = await _handler.Handle(command, CancellationToken.None);

        Assert.True(result.IsSuccess);
        _mockModelVersionRepository.Verify(
            x => x.UpdateAsync(It.Is<ModelVersion>(v =>
                v.TriangleCount == 1200 &&
                v.VertexCount == 600 &&
                v.MeshCount == 5 &&
                v.MaterialCount == 2 &&
                v.MaterialNames.Count == 2),
            It.IsAny<CancellationToken>()), Times.Once);
    }
}
