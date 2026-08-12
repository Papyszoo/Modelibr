using Application.Extraction.Derivation;
using Application.Models;
using Application.Search;
using Domain.Models;
using Xunit;

namespace Application.Tests.Search;

public class SearchDocumentBuilderTests
{
    private static DerivedAsset DerivedWith(params string[] tokens) =>
        new(
            DeriveVersion: 1,
            Tokens: tokens,
            OriginConvention: null,
            GridSize: null,
            ModularKit: false,
            ShapeClass: "blocky",
            LodChains: Array.Empty<DerivedLodChain>(),
            QualityFlags: Array.Empty<string>(),
            BrowseSummary: "a sword",
            Unnamed: false,
            Parts: Array.Empty<DerivedPart>());

    private static SceneGraphRollupsDto Rollups() =>
        new(
            MeshCount: 2,
            TotalTriangles: 1200,
            TotalVertices: 5000,
            MaterialCount: 3,
            MaterialNames: new List<string> { "Steel", "Leather" },
            BoneCount: 0,
            WorldBounds: new SceneGraphWorldBoundsDto(new List<double> { 0.5, 2.0, 0.5 }),
            AnimationCount: 0,
            AnimationNames: null);

    private static SceneGraphPartDto Part() =>
        new("Root/Sword", "Sword", "Root", 1, "mesh", 1200, 5000, "hash", true, null);

    private static AssetSearchDocument AssetDoc(IReadOnlyList<AssetSearchDocument> docs) =>
        docs.Single(d => d.PartPath == null);

    [Fact]
    public void BuildForModel_Separates_Inferred_Concepts_From_Authored_Tokens()
    {
        // The semantic bridge: a "sword" asset in a "Weapons" category must be findable
        // by the conceptual query "weapon".
        //
        // The concept label used to be folded into Tokens alongside the authored name.
        // That made an inferred match indistinguishable from a named one, so on a real
        // library "vehicle" ranked boat_ornament and tram_rail - vehicles only by
        // inference - level with SM_Veh_Car_Van_01, and alphabetical tie-breaking then
        // decided the result page. Concepts now have their own field and are ranked
        // below authored names.
        var docs = SearchDocumentBuilder.BuildForModel(
            modelId: 1, versionId: 1, isCurrentVersion: true,
            assetName: "Sword", derived: DerivedWith("sword", "blade"),
            rollups: Rollups(), rawParts: new[] { Part() }, now: DateTime.UtcNow,
            categoryId: 7, categoryName: "Sci-Fi Weapons");

        var doc = AssetDoc(docs);
        var tokens = doc.Tokens.Split(' ');
        var concepts = doc.ConceptLabels.Split(' ');

        Assert.Contains("sword", tokens);      // authored token preserved
        Assert.Contains("Weapons", tokens);    // the user's own category words are authored too
        Assert.Contains("weapon", concepts);   // inferred concept, kept separate
        Assert.DoesNotContain("weapon", tokens);
    }

    [Fact]
    public void BuildForModel_Projects_Attributes_And_Category_Onto_AssetDoc()
    {
        var docs = SearchDocumentBuilder.BuildForModel(
            modelId: 1, versionId: 1, isCurrentVersion: true,
            assetName: "Sword", derived: DerivedWith("sword"),
            rollups: Rollups(), rawParts: new[] { Part() }, now: DateTime.UtcNow,
            categoryId: 7, categoryName: "Weapons");

        var asset = AssetDoc(docs);
        Assert.Equal(3, asset.MaterialCount);
        Assert.Equal(5000, asset.VertexCount);
        Assert.Equal(2, asset.PartCount);
        Assert.Equal(0, asset.AnimationCount);
        Assert.Equal(2.0, asset.MaxDimension);   // largest of {0.5, 2.0, 0.5}
        Assert.True(asset.HasUvs);
        Assert.Equal(7, asset.CategoryId);
        Assert.Equal("Weapons", asset.CategoryName);
    }

    [Fact]
    public void BuildForModel_Without_Category_Leaves_Category_Null()
    {
        var docs = SearchDocumentBuilder.BuildForModel(
            modelId: 1, versionId: 1, isCurrentVersion: true,
            assetName: "Crate", derived: DerivedWith("crate"),
            rollups: Rollups(), rawParts: new[] { Part() }, now: DateTime.UtcNow);

        var asset = AssetDoc(docs);
        Assert.Null(asset.CategoryId);
        Assert.Null(asset.CategoryName);
    }
}
