using Application.Abstractions.Repositories;
using Application.Models;
using Domain.Models;
using Moq;
using Xunit;

namespace Application.Tests.Models;

public class GetModelByIdQueryHandlerTests
{
    private const string ModelHash = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

    private readonly Mock<IModelRepository> _models = new();
    private readonly Mock<IAssetExtractionRepository> _extractions = new();
    private readonly GetModelByIdQueryHandler _handler;

    public GetModelByIdQueryHandlerTests()
    {
        _handler = new GetModelByIdQueryHandler(_models.Object, _extractions.Object);
    }

    private static Model ModelWithLatestVersion(int modelId, int versionId)
    {
        var model = Model.Create("Rigged", DateTime.UtcNow).WithId(modelId);
        var version = model.CreateVersion("v1", DateTime.UtcNow);
        version.WithId(versionId);
        return model;
    }

    [Fact]
    public async Task Handle_WhenRawPayloadCarriesClipsAndShapeKeys_TechnicalMetadataExposesThem()
    {
        var model = ModelWithLatestVersion(7, 11);
        _models.Setup(r => r.GetByIdAsync(7, It.IsAny<CancellationToken>())).ReturnsAsync(model);

        // The scene-graph raw payload shape: PascalCase outer properties (the
        // endpoint re-serializes the request) and camelCase inside the part detail.
        const string payload = """
        {
          "Rollups": {
            "AnimationCount": 2,
            "Animations": [
              { "Name": "Wave", "DurationSeconds": 1, "Kinds": ["skeletal"] },
              { "Name": "Pulse", "DurationSeconds": 2, "Kinds": ["morph"] }
            ]
          },
          "Parts": [
            { "Name": "Box", "Detail": { "shapeKeys": ["Squash", "Stretch"] } },
            { "Name": "Skeleton", "Detail": { "shapeKeys": [] } }
          ]
        }
        """;
        _extractions
            .Setup(r => r.GetLatestForAssetAsync("Model", 7, 11, It.IsAny<CancellationToken>()))
            .ReturnsAsync(AssetExtraction.Create("Model", 7, 11, ModelHash, payload, 1, 1, DateTime.UtcNow));

        var result = await _handler.Handle(new GetModelByIdQuery(7), CancellationToken.None);

        Assert.True(result.IsSuccess);
        var technicalMetadata = result.Value.Model.TechnicalMetadata;

        Assert.Equal(2, technicalMetadata.Animations.Count);
        Assert.Equal("Wave", technicalMetadata.Animations[0].Name);
        Assert.Equal(1, technicalMetadata.Animations[0].DurationSeconds);
        Assert.Equal(new[] { "skeletal" }, technicalMetadata.Animations[0].Kinds);
        Assert.Equal("Pulse", technicalMetadata.Animations[1].Name);
        Assert.Equal(new[] { "morph" }, technicalMetadata.Animations[1].Kinds);

        Assert.Single(technicalMetadata.ShapeKeys);
        Assert.Equal("Box", technicalMetadata.ShapeKeys[0].MeshName);
        Assert.Equal(new[] { "Squash", "Stretch" }, technicalMetadata.ShapeKeys[0].Names);
    }

    [Fact]
    public async Task Handle_WhenNoExtractionRow_ExposesEmptyLists()
    {
        var model = ModelWithLatestVersion(7, 11);
        _models.Setup(r => r.GetByIdAsync(7, It.IsAny<CancellationToken>())).ReturnsAsync(model);
        // GetLatestForAssetAsync is left returning null: no extraction yet.

        var result = await _handler.Handle(new GetModelByIdQuery(7), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Empty(result.Value.Model.TechnicalMetadata.Animations);
        Assert.Empty(result.Value.Model.TechnicalMetadata.ShapeKeys);
    }
}
