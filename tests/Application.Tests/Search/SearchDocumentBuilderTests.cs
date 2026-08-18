using System.Text.Json;
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
            OriginInBounds: null,
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

    /// <summary>
    /// A UV layout is a property of the whole asset, so it belongs on the asset document and
    /// nowhere else. Projected onto parts it would answer a question nobody can act on: a
    /// single mesh of a properly unwrapped asset looks packed on its own, and a part is not
    /// something `generate_uvs` or a bake is aimed at.
    /// </summary>
    [Fact]
    public void BuildForModel_Puts_The_Uv_Layout_On_The_Asset_Doc_Only()
    {
        var packed = new SceneGraphPartDto(
            "Root/Sword", "Sword", "Root", 1, "mesh", 1200, 5000, "hash", true,
            JsonSerializer.SerializeToElement(new
            {
                uvBounds = new { min = new[] { 0.10, 0.10 }, max = new[] { 0.15, 0.15 } },
            }));

        var docs = SearchDocumentBuilder.BuildForModel(
            modelId: 1, versionId: 1, isCurrentVersion: true,
            assetName: "Sword", derived: DerivedWith("sword"),
            rollups: Rollups(), rawParts: new[] { packed }, now: DateTime.UtcNow);

        Assert.Equal(UvStatusClassifier.AtlasPacked, AssetDoc(docs).UvStatus);
        Assert.All(docs.Where(d => d.PartPath != null), d => Assert.Null(d.UvStatus));
    }

    /// <summary>
    /// The pair that motivated a second field. `hasUvs` says true - correctly, the model has
    /// UVs and renders because of them - while the layout says those UVs leave no room to
    /// bake into. An agent filtering on `hasUvs` alone picks this model to texture and fails.
    /// </summary>
    [Fact]
    public void BuildForModel_Reports_An_Atlas_Packed_Asset_As_Having_Uvs_And_As_Needing_An_Unwrap()
    {
        var packed = new SceneGraphPartDto(
            "Root/Prop", "Prop", "Root", 1, "mesh", 300, 200, "hash", true,
            JsonSerializer.SerializeToElement(new
            {
                uvBounds = new { min = new[] { 0.128, 0.372 }, max = new[] { 0.139, 0.383 } },
            }));

        var asset = AssetDoc(SearchDocumentBuilder.BuildForModel(
            modelId: 1, versionId: 1, isCurrentVersion: true,
            assetName: "SM_Prop_CarboardBox_01", derived: DerivedWith("prop"),
            rollups: Rollups(), rawParts: new[] { packed }, now: DateTime.UtcNow));

        Assert.True(asset.HasUvs);
        Assert.Equal(UvStatusClassifier.AtlasPacked, asset.UvStatus);
    }

    [Fact]
    public void BuildForModel_Puts_Authored_Tags_And_Description_On_The_Asset_Doc_Only()
    {
        // A re-derive rebuilds documents wholesale, so the builder has to carry the tags
        // through - otherwise every re-extraction quietly un-finds a labelled asset.
        var docs = SearchDocumentBuilder.BuildForModel(
            modelId: 1, versionId: 1, isCurrentVersion: true,
            assetName: "Chair", derived: DerivedWith("chair"),
            rollups: Rollups(), rawParts: new[] { Part() }, now: DateTime.UtcNow,
            authoredTags: new[] { "oak", "rustic" },
            description: "A rustic oak dining chair.");

        var asset = AssetDoc(docs);
        Assert.Equal("oak rustic", asset.AuthoredTags);
        Assert.Equal("A rustic oak dining chair.", asset.Description);

        // Tags describe the asset. Copying them onto every part would multiply one signal
        // by the part count and let a many-part model dominate any tag query.
        Assert.All(docs.Where(d => d.PartPath is not null), part =>
        {
            Assert.Equal(string.Empty, part.AuthoredTags);
            Assert.Equal(string.Empty, part.Description);
        });
    }

    [Fact]
    public void BuildForModel_Without_Tags_Leaves_The_Authored_Fields_Empty_Not_Null()
    {
        // The match clauses concatenate these columns, and a null would make the whole
        // expression null and silently drop the document from its tier.
        var docs = SearchDocumentBuilder.BuildForModel(
            modelId: 1, versionId: 1, isCurrentVersion: true,
            assetName: "Chair", derived: DerivedWith("chair"),
            rollups: Rollups(), rawParts: new[] { Part() }, now: DateTime.UtcNow);

        var asset = AssetDoc(docs);
        Assert.Equal(string.Empty, asset.AuthoredTags);
        Assert.Equal(string.Empty, asset.Description);
    }

    private static DerivedAsset DerivedWithParts(params DerivedPart[] parts) =>
        new(
            DeriveVersion: 1,
            Tokens: new[] { "car" },
            OriginConvention: null,
            OriginInBounds: null,
            GridSize: null,
            ModularKit: false,
            ShapeClass: "blocky",
            LodChains: Array.Empty<DerivedLodChain>(),
            QualityFlags: Array.Empty<string>(),
            BrowseSummary: "a car",
            Unnamed: false,
            Parts: parts);

    private static DerivedPart PartWithFlags(string path, params string[] qualityFlags) =>
        new(
            PartPath: path,
            Tokens: new[] { "car" },
            Prominence: Prominence.Full,
            ShapeClass: "blocky",
            InstanceGroup: null,
            InstanceRepresentative: false,
            QualityFlags: qualityFlags,
            BrowseSummary: "a car body");

    [Fact]
    public void BuildForModel_Excludes_Degenerate_Parts_From_The_Index()
    {
        // A zero-volume node is not a placeable thing. On the real 1,717-model library,
        // `car` + maxTriangles=10000 returned an 8-triangle, 0x0x0 m node at rank #1 -
        // an agent building a street would have placed an invisible car. A short token
        // blob matches a short query more completely than a fully-named mesh does, so
        // leaving these in the index lets them outrank real geometry.
        var docs = SearchDocumentBuilder.BuildForModel(
            modelId: 1, versionId: 1, isCurrentVersion: true,
            assetName: "Car",
            derived: DerivedWithParts(
                PartWithFlags("Root/Body"),
                PartWithFlags("Root/Empty", "degenerate_bounds")),
            rollups: Rollups(), rawParts: new[] { Part() }, now: DateTime.UtcNow);

        var partPaths = docs.Where(d => d.PartPath != null).Select(d => d.PartPath).ToList();

        Assert.Contains("Root/Body", partPaths);
        Assert.DoesNotContain("Root/Empty", partPaths);
    }

    [Fact]
    public void BuildForModel_Keeps_The_Asset_Findable_When_Every_Part_Is_Degenerate()
    {
        // Excluding parts must never make the asset itself unreachable - the asset-level
        // document carries the authored name, so a user searching for it by name still
        // finds it even when none of its nodes are placeable.
        var docs = SearchDocumentBuilder.BuildForModel(
            modelId: 1, versionId: 1, isCurrentVersion: true,
            assetName: "Car",
            derived: DerivedWithParts(PartWithFlags("Root/Empty", "degenerate_bounds")),
            rollups: Rollups(), rawParts: new[] { Part() }, now: DateTime.UtcNow);

        Assert.Single(docs);
        Assert.Equal("Car", AssetDoc(docs).DisplayName);
    }

    [Fact]
    public void BuildForModel_Keeps_Parts_Carrying_Other_Quality_Flags()
    {
        // Only zero volume excludes. A part with no UVs or a negative scale is a real
        // mesh with a fixable problem - and "everything without UVs" is exactly the kind
        // of filter-only browse query these flags exist to answer.
        var docs = SearchDocumentBuilder.BuildForModel(
            modelId: 1, versionId: 1, isCurrentVersion: true,
            assetName: "Car",
            derived: DerivedWithParts(PartWithFlags("Root/Body", "no_uvs", "negative_scale")),
            rollups: Rollups(), rawParts: new[] { Part() }, now: DateTime.UtcNow);

        Assert.Contains(docs, d => d.PartPath == "Root/Body");
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

    /// <summary>
    /// Size in the index has to be the asset's real size, not the extraction rollups'.
    ///
    /// The rollups are the trap: for anything extracted before the capture point moved ahead
    /// of `normalizeModel`, they hold the thumbnail framing box. On the real library that
    /// made all 1762 models report a longest axis of exactly 2, so `minSize`/`maxSize`
    /// matched nothing at all and an agent had to place an asset just to learn how big it is.
    /// </summary>
    [Fact]
    public void BuildForModel_Prefers_The_Versions_Own_Bounds_Over_The_Rollups()
    {
        // What the sofa really is (2.188 x 0.788 x 1.023) against what a pre-fix rollup says.
        var docs = SearchDocumentBuilder.BuildForModel(
            modelId: 963, versionId: 1, isCurrentVersion: true,
            assetName: "GlamVelvetSofa", derived: DerivedWith("sofa"),
            rollups: Rollups(), rawParts: new[] { Part() }, now: DateTime.UtcNow,
            assetDimensions: new[] { 2.188, 0.788, 1.023 });

        var asset = AssetDoc(docs);
        Assert.Equal(2.188, asset.DimensionX!.Value, 3);
        Assert.Equal(0.788, asset.DimensionY!.Value, 3);
        Assert.Equal(1.023, asset.DimensionZ!.Value, 3);
        Assert.Equal(2.188, asset.MaxDimension!.Value, 3);
        Assert.Equal(SearchDocumentBuilder.ScaleAuthored, asset.ScaleConvention);
    }

    [Fact]
    public void BuildForModel_Falls_Back_To_The_Rollups_When_The_Version_Has_No_Bounds()
    {
        var docs = SearchDocumentBuilder.BuildForModel(
            modelId: 1, versionId: 1, isCurrentVersion: true,
            assetName: "Crate", derived: DerivedWith("crate"),
            rollups: Rollups(), rawParts: new[] { Part() }, now: DateTime.UtcNow,
            assetDimensions: null);

        // Rollups() is 0.5 x 2.0 x 0.5 - stale or not, an indexed size beats none.
        Assert.Equal(2.0, AssetDoc(docs).MaxDimension!.Value, 3);
    }

    [Theory]
    // A longest axis landing on 1 or 2 almost exactly is an exporter's unit box, not a
    // measurement - the case that put a 2 m wrench next to a 2 m armchair.
    [InlineData(2.0, SearchDocumentBuilder.ScaleNormalized)]
    [InlineData(1.0, SearchDocumentBuilder.ScaleNormalized)]
    // ...but a real object that happens to be large stays trustworthy.
    [InlineData(2.188, SearchDocumentBuilder.ScaleAuthored)]
    [InlineData(0.8, SearchDocumentBuilder.ScaleAuthored)]
    public void ClassifyScale_Separates_A_Unit_Box_From_A_Measurement(double max, string expected)
    {
        Assert.Equal(expected, SearchDocumentBuilder.ClassifyScale(max));
    }

    [Fact]
    public void ClassifyScale_Without_Bounds_Is_Null_Rather_Than_Authored()
    {
        // "Unknown" must not collapse into "authored": an agent reads the second as a
        // licence to place the thing at scale 1.
        Assert.Null(SearchDocumentBuilder.ClassifyScale(null));
        Assert.Null(SearchDocumentBuilder.ClassifyScale(0));
    }
}
