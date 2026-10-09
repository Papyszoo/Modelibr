using Application.Abstractions.Repositories;
using Application.Extraction;
using Domain.Models;
using Moq;
using Xunit;

namespace Application.Tests.Extraction;

public class GetAssetMetadataQueryHandlerTests
{
    private const string Hash = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

    private readonly Mock<IAssetDerivationRepository> _derivations = new();
    private readonly Mock<IAssetPartRepository> _parts = new();
    private readonly Mock<IAssetExtractionRepository> _extractions = new();
    private readonly GetAssetMetadataQueryHandler _handler;

    public GetAssetMetadataQueryHandlerTests()
    {
        _parts
            .Setup(r => r.GetForAssetAsync(
                It.IsAny<string>(), It.IsAny<int>(), It.IsAny<int?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<AssetPart>());
        _handler = new GetAssetMetadataQueryHandler(_derivations.Object, _parts.Object, _extractions.Object);
    }

    [Fact]
    public async Task Handle_WhenClipMetadataStored_ReturnsAnimationsAndShapeKeys()
    {
        _derivations
            .Setup(r => r.GetByKeyAsync("Model", 7, 11, It.IsAny<CancellationToken>()))
            .ReturnsAsync(AssetDerivation.Create("Model", 7, 11, 1, "{}", DateTime.UtcNow));

        // The flat technical-metadata payload shape (camelCase, worker input).
        const string payload = """
        {
          "animations": [
            { "name": "Wave", "durationSeconds": 1, "kinds": ["skeletal"] },
            { "name": "Pulse", "durationSeconds": 2, "kinds": ["morph"] }
          ],
          "shapeKeys": [ { "meshName": "Box", "shapeKeys": ["Squash", "Stretch"] } ]
        }
        """;
        _extractions
            .Setup(r => r.GetLatestForAssetAsync("Model", 7, 11, It.IsAny<CancellationToken>()))
            .ReturnsAsync(AssetExtraction.Create("Model", 7, 11, Hash, payload, 1, 1, DateTime.UtcNow));

        var result = await _handler.Handle(
            new GetAssetMetadataQuery("Model", 7, VersionId: 11), CancellationToken.None);

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

    [Fact]
    public async Task Handle_WhenActiveVersionRequested_ReadsTheActiveVersionsExtraction()
    {
        _derivations
            .Setup(r => r.GetForActiveVersionAsync("Model", 7, It.IsAny<CancellationToken>()))
            .ReturnsAsync(AssetDerivation.Create("Model", 7, 11, 1, "{}", DateTime.UtcNow));
        _extractions
            .Setup(r => r.GetLatestForAssetAsync("Model", 7, 11, It.IsAny<CancellationToken>()))
            .ReturnsAsync(AssetExtraction.Create(
                "Model", 7, 11, Hash,
                """{ "animations": [ { "name": "Wave", "durationSeconds": 1, "kinds": ["skeletal"] } ] }""",
                1, 1, DateTime.UtcNow));

        var result = await _handler.Handle(new GetAssetMetadataQuery("Model", 7), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Single(result.Value.Animations!);
        Assert.Empty(result.Value.ShapeKeys!);
        _extractions.Verify(
            r => r.GetLatestForAssetAsync("Model", 7, 11, It.IsAny<CancellationToken>()),
            Times.Once);
    }
}
