using Application.Abstractions.Repositories;
using Application.Metadata;
using Domain.Models;
using Moq;
using SharedKernel;
using Xunit;

namespace Application.Tests.Metadata;

public class ReadAssetMetadataQueryHandlerTests
{
    private const string Hash = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

    [Fact]
    public async Task Handle_WhenRawPayloadStored_ReturnsAnimationsAndShapeKeysAtTheTopLevel()
    {
        var entity = new Mock<IAssetEntityMetadata>();
        entity
            .Setup(e => e.ReadAsync("Model", 7, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Result.Success(new AssetEntityMetadataState(
                "Rigged", null, Array.Empty<string>(), null, null)));

        var metadata = new Mock<IAssetMetadataRepository>();
        metadata
            .Setup(r => r.GetAsync("Model", 7, It.IsAny<CancellationToken>()))
            .ReturnsAsync((AssetMetadata?)null);

        var documents = new Mock<IAssetSearchDocumentRepository>();
        documents
            .Setup(r => r.GetCurrentAssetDocumentAsync("Model", 7, It.IsAny<CancellationToken>()))
            .ReturnsAsync((AssetSearchDocument?)null);

        var extractions = new Mock<IAssetExtractionRepository>();
        extractions
            .Setup(r => r.GetLatestForAssetAsync("Model", 7, null, It.IsAny<CancellationToken>()))
            .ReturnsAsync(AssetExtraction.Create(
                "Model", 7, 11, Hash,
                """
                {
                  "animations": [
                    { "name": "Wave", "durationSeconds": 1, "kinds": ["skeletal"] },
                    { "name": "Pulse", "durationSeconds": 2, "kinds": ["morph"] }
                  ],
                  "shapeKeys": [ { "meshName": "Box", "shapeKeys": ["Squash", "Stretch"] } ]
                }
                """,
                1, 1, DateTime.UtcNow));

        var handler = new ReadAssetMetadataQueryHandler(
            entity.Object, metadata.Object, documents.Object, extractions.Object);

        var result = await handler.Handle(new ReadAssetMetadataQuery("Model", 7), CancellationToken.None);

        Assert.True(result.IsSuccess);
        var response = result.Value;

        Assert.Equal(2, response.Animations!.Count);
        Assert.Equal("Wave", response.Animations[0].Name);
        Assert.Equal(1, response.Animations[0].DurationSeconds);
        Assert.Equal(new[] { "skeletal" }, response.Animations[0].Kinds);
        Assert.Equal("Pulse", response.Animations[1].Name);
        Assert.Equal(new[] { "morph" }, response.Animations[1].Kinds);

        Assert.Single(response.ShapeKeys!);
        Assert.Equal("Box", response.ShapeKeys![0].MeshName);
        Assert.Equal(new[] { "Squash", "Stretch" }, response.ShapeKeys[0].Names);
    }
}
