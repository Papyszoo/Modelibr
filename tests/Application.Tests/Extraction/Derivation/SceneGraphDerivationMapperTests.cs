using System.Text.Json;
using Application.Extraction.Derivation;
using Application.Models;
using Xunit;

namespace Application.Tests.Extraction.Derivation;

public class SceneGraphDerivationMapperTests
{
    private static SceneGraphPartDto Part(string detailJson) => new(
        PartPath: "/Torus",
        Name: "Torus",
        ParentPath: "/",
        Depth: 1,
        ObjectType: "mesh",
        TriangleCount: 384,
        VertexCount: 1152,
        GeometryHash: "abc",
        HasUvs: true,
        Detail: JsonDocument.Parse(detailJson).RootElement);

    private static readonly SceneGraphRollupsDto Rollups =
        new(null, null, null, null, null, null,
            new SceneGraphWorldBoundsDto(new List<double> { 2, 0.4, 2 }), null, null);

    [Fact]
    public void PartDimensions_PreferWorldBoundingBox_OverLocalBox()
    {
        // Local box is object-space (2.5×2.5×0.5); world box reflects the node
        // transform (2×0.4×2). The derived part dimensions must be the world box.
        var detail = """
        {
          "boundingBox":      { "min": [-1.25,-1.25,-0.25], "max": [1.25,1.25,0.25] },
          "worldBoundingBox": { "min": [-1,-0.2,-1],        "max": [1,0.2,1] }
        }
        """;

        var input = SceneGraphDerivationMapper.ToDerivationInput("Asset", Rollups, new[] { Part(detail) });

        Assert.Equal(new double[] { 2, 0.4, 2 }, input.Parts[0].Dimensions);
    }

    [Fact]
    public void PartDimensions_FallBackToLocalBox_WhenWorldBoxAbsent()
    {
        // Extractor-v1 / bpy payloads have no worldBoundingBox - the local box is used.
        var detail = """
        { "boundingBox": { "min": [-1.25,-1.25,-0.25], "max": [1.25,1.25,0.25] } }
        """;

        var input = SceneGraphDerivationMapper.ToDerivationInput("Asset", Rollups, new[] { Part(detail) });

        Assert.Equal(new double[] { 2.5, 2.5, 0.5 }, input.Parts[0].Dimensions);
    }

    [Fact]
    public void OriginInBounds_IsMeasuredFromTheRollupBox()
    {
        // Base-at-origin geometry: the origin is on the bottom face and centred in X/Z.
        var rollups = Rollups with
        {
            WorldBounds = new SceneGraphWorldBoundsDto(
                new List<double> { 1, 2, 1 },
                Min: new List<double> { -0.5, 0, -0.5 },
                Max: new List<double> { 0.5, 2, 0.5 }),
        };

        var input = SceneGraphDerivationMapper.ToDerivationInput("Asset", rollups, Array.Empty<SceneGraphPartDto>());

        Assert.Equal(new double[] { 0.5, 0, 0.5 }, input.OriginInBounds);
    }

    [Fact]
    public void OriginInBounds_FallsBackToTheUnionOfPartBoxes_WhenTheRollupHasNoMinMax()
    {
        // The already-imported library: the rollup carries only dimensions, so the origin
        // has to come from the parts. Two parts, unioning to y ∈ [0, 2].
        var lower = """{ "worldBoundingBox": { "min": [-0.5,0,-0.5], "max": [0.5,1,0.5] } }""";
        var upper = """{ "worldBoundingBox": { "min": [-0.5,1,-0.5], "max": [0.5,2,0.5] } }""";

        var input = SceneGraphDerivationMapper.ToDerivationInput(
            "Asset", Rollups, new[] { Part(lower), Part(upper) });

        Assert.Equal(new double[] { 0.5, 0, 0.5 }, input.OriginInBounds);
    }

    [Fact]
    public void OriginInBounds_WhenNothingCarriesAWorldBox_IsNull()
    {
        // Null rather than a fabricated 0.5 - "I do not know where its feet are" has to stay
        // distinguishable from "its origin is centred", which is the whole point of measuring
        // the origin instead of labelling it.
        var rollups = Rollups with { WorldBounds = new SceneGraphWorldBoundsDto(null) };
        var localOnly = """{ "boundingBox": { "min": [0,0,0], "max": [1,1,1] } }""";

        var input = SceneGraphDerivationMapper.ToDerivationInput(
            "Asset", rollups, new[] { Part(localOnly) });

        Assert.Null(input.OriginInBounds);
    }
}
