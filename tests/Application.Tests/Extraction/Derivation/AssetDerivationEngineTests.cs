using Application.Extraction.Derivation;
using Xunit;

namespace Application.Tests.Extraction.Derivation;

public class AssetDerivationEngineTests
{
    private readonly DerivationOptions _options = new();

    private static DerivationPartInput Part(
        string path,
        string name,
        string objectType = "mesh",
        int? tris = null,
        string? hash = null,
        bool? hasUvs = null,
        double[]? dims = null,
        bool hidden = false,
        bool negativeScale = false,
        int depth = 1) =>
        new(path, name, "/", depth, objectType, tris, hash, hasUvs, dims, hidden, negativeScale);

    private DerivedAsset Derive(params DerivationPartInput[] parts) =>
        Derive("Chair", null, parts);

    private DerivedAsset Derive(string? assetName, double[]? worldDims, params DerivationPartInput[] parts) =>
        AssetDerivationEngine.Derive(
            new DerivationAssetInput(assetName, worldDims, parts), _options);

    private static DerivedPart Find(DerivedAsset a, string path) => a.Parts.Single(p => p.PartPath == path);

    [Fact]
    public void NamingRule_OutranksSize_SmallNamedIsFull_LargeUnnamedIsNot()
    {
        var result = Derive(
            Part("/knob", "Doorknob_Brass", dims: new[] { 0.02, 0.02, 0.02 }),
            Part("/mesh4", "Mesh.004", dims: new[] { 3.0, 3.0, 3.0 }));

        Assert.Equal(Prominence.Full, Find(result, "/knob").Prominence);
        Assert.Equal(Prominence.Secondary, Find(result, "/mesh4").Prominence);
    }

    [Fact]
    public void Prominence_HidesCollisionAndNonZeroLod()
    {
        var result = Derive(
            Part("/wall", "Wall_Brick"),
            Part("/wall_col", "Wall_Collision"),
            Part("/wall_lod2", "Wall_LOD2"),
            Part("/wall_lod0", "Wall_LOD0"));

        Assert.Equal(Prominence.Full, Find(result, "/wall").Prominence);
        Assert.Equal(Prominence.Hidden, Find(result, "/wall_col").Prominence);
        Assert.Equal(Prominence.Hidden, Find(result, "/wall_lod2").Prominence);
        Assert.Equal(Prominence.Full, Find(result, "/wall_lod0").Prominence);
    }

    [Fact]
    public void Prominence_HidesHelpersAndHiddenObjects()
    {
        var result = Derive(
            Part("/root", "Root", objectType: "empty"),
            Part("/hiddenMesh", "Secret_Door", hidden: true));

        Assert.Equal(Prominence.Hidden, Find(result, "/root").Prominence);
        Assert.Equal(Prominence.Hidden, Find(result, "/hiddenMesh").Prominence);
    }

    [Fact]
    public void InstanceGrouping_KeepsOnlyRepresentativeAtFullWeight()
    {
        var result = Derive(
            Part("/bolt1", "Bolt", hash: "aaaa1111"),
            Part("/bolt2", "Bolt", hash: "aaaa1111"),
            Part("/bolt3", "Bolt", hash: "aaaa1111"));

        var full = result.Parts.Count(p => p.Prominence == Prominence.Full);
        Assert.Equal(1, full);
        Assert.All(result.Parts, p => Assert.Equal("aaaa1111", p.InstanceGroup));
        Assert.Single(result.Parts, p => p.InstanceRepresentative);
    }

    [Fact]
    public void DegenerateCase_ObjectNNN_FlagsUnnamedAndStillSurfacesLargest()
    {
        var parts = Enumerable.Range(1, 8)
            .Select(i => Part($"/o{i}", $"Object.{i:000}", dims: new[] { (double)i, i, i }))
            .ToArray();

        var result = Derive("scene", null, parts);

        Assert.True(result.Unnamed);
        // At least one part promoted to full despite no meaningful names.
        Assert.Contains(result.Parts, p => p.Prominence == Prominence.Full);
        // The largest (Object.008) should be among the promoted.
        Assert.Equal(Prominence.Full, Find(result, "/o8").Prominence);
    }

    [Fact]
    public void ShapeClass_ClassifiesPlanarTallWideBlocky()
    {
        Assert.Equal("planar", AssetDerivationEngine.Derive(
            new DerivationAssetInput("f", new[] { 4.0, 4.0, 0.05 }, Array.Empty<DerivationPartInput>()), _options).ShapeClass);
        Assert.Equal("tall", AssetDerivationEngine.Derive(
            new DerivationAssetInput("f", new[] { 0.5, 3.0, 0.5 }, Array.Empty<DerivationPartInput>()), _options).ShapeClass);
        Assert.Equal("wide", AssetDerivationEngine.Derive(
            new DerivationAssetInput("f", new[] { 5.0, 1.0, 1.0 }, Array.Empty<DerivationPartInput>()), _options).ShapeClass);
        Assert.Equal("blocky", AssetDerivationEngine.Derive(
            new DerivationAssetInput("f", new[] { 1.0, 1.0, 1.0 }, Array.Empty<DerivationPartInput>()), _options).ShapeClass);
    }

    [Fact]
    public void GridAndModularKit_DetectedFromSnappingParts()
    {
        var result = Derive("kit", new[] { 4.0, 3.0, 1.0 },
            Part("/a", "Floor_A", dims: new[] { 1.0, 0.1, 1.0 }),
            Part("/b", "Floor_B", dims: new[] { 1.0, 0.1, 2.0 }),
            Part("/c", "Wall_A", dims: new[] { 2.0, 1.0, 0.1 }));

        Assert.Equal(1.0, result.GridSize);
        Assert.True(result.ModularKit);
    }

    [Fact]
    public void LodChain_DetectedByNamingAndOrdered()
    {
        var result = Derive(
            Part("/rock_lod0", "Rock_LOD0", tris: 5000),
            Part("/rock_lod1", "Rock_LOD1", tris: 1000),
            Part("/rock_lod2", "Rock_LOD2", tris: 200));

        var chain = Assert.Single(result.LodChains);
        Assert.Equal(new[] { "/rock_lod0", "/rock_lod1", "/rock_lod2" }, chain.PartPaths);
    }

    [Fact]
    public void QualityFlags_ReportedAsFacts()
    {
        var result = Derive(
            Part("/m", "Wall", hasUvs: false, negativeScale: true));

        var part = Find(result, "/m");
        Assert.Contains("no_uvs", part.QualityFlags);
        Assert.Contains("negative_scale", part.QualityFlags);
        Assert.Contains("missing_uvs", result.QualityFlags);
        Assert.Contains("negative_scale", result.QualityFlags);
    }

    [Fact]
    public void OriginConvention_ClassifiesCenteredAndBottom()
    {
        var centered = AssetDerivationEngine.Derive(
            new DerivationAssetInput("a", new[] { 1.0, 1.0, 1.0 }, Array.Empty<DerivationPartInput>(),
                new[] { 0.5, 0.5, 0.5 }), _options);
        Assert.Equal("centered", centered.OriginConvention);

        var bottom = AssetDerivationEngine.Derive(
            new DerivationAssetInput("a", new[] { 1.0, 1.0, 1.0 }, Array.Empty<DerivationPartInput>(),
                new[] { 0.5, 0.0, 0.5 }), _options);
        Assert.Equal("bottom-center", bottom.OriginConvention);
    }

    [Fact]
    public void BrowseSummary_IsDeterministicHumanLine()
    {
        var result = Derive("Chair", new[] { 0.6, 1.2, 0.6 },
            Part("/seat", "Seat", tris: 1240, dims: new[] { 0.6, 0.1, 0.6 }));

        Assert.Equal("Seat — mesh, 1,240 tris, 0.6×0.1×0.6 m", Find(result, "/seat").BrowseSummary);
        Assert.StartsWith("Chair — 1 part, 1,240 tris, 0.6×1.2×0.6 m", result.BrowseSummary);
    }

    [Fact]
    public void PartBrowseSummary_GenericName_DoesNotRepeatObjectType()
    {
        // "Torus"/"Cube" are generic exporter names → the display name falls back to
        // the object type; the summary must not read "mesh — mesh, …" (regression).
        var result = Derive("Asset", new[] { 2.0, 0.4, 2.0 },
            Part("/Torus", "Torus", tris: 384, dims: new[] { 2.0, 0.4, 2.0 }));

        Assert.Equal("mesh — 384 tris, 2×0.4×2 m", Find(result, "/Torus").BrowseSummary);
    }

    [Fact]
    public void GeometricPriors_OffByDefault_OnWhenEnabled()
    {
        var door = Part("/door", "Object.005", dims: new[] { 0.9, 2.0, 0.1 });

        var off = AssetDerivationEngine.Derive(new DerivationAssetInput("a", null, new[] { door }), _options);
        Assert.Null(Find(off, "/door").Prior);

        var on = AssetDerivationEngine.Derive(
            new DerivationAssetInput("a", null, new[] { door }),
            new DerivationOptions { EnableGeometricPriors = true });
        Assert.Equal("door", Find(on, "/door").Prior?.Guess);
    }

    [Fact]
    public void Derive_IsPure_SameInputSameOutput()
    {
        var input = new DerivationAssetInput("Chair", new[] { 1.0, 1.0, 1.0 },
            new[] { Part("/seat", "Seat", tris: 100, dims: new[] { 1.0, 0.1, 1.0 }) });

        var a = AssetDerivationEngine.Derive(input, _options);
        var b = AssetDerivationEngine.Derive(input, _options);

        Assert.Equal(a.BrowseSummary, b.BrowseSummary);
        Assert.Equal(a.Parts[0].Prominence, b.Parts[0].Prominence);
        Assert.Equal(a.Tokens, b.Tokens);
    }
}
