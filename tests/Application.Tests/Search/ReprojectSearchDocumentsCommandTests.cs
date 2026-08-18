using System.Text.Json;
using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Extraction;
using Application.Extraction.Derivation;
using Application.Models;
using Application.Search;
using Domain.Models;
using Domain.Services;
using Moq;
using Xunit;

namespace Application.Tests.Search;

/// <summary>
/// The projection is rebuilt from the layers already stored, so the thing worth proving is
/// that reading those layers back reaches the same builder inputs the extraction path hands
/// over. Everything else here is about a library-wide run surviving one broken asset.
/// </summary>
public class ReprojectSearchDocumentsCommandTests
{
    private const int ModelId = 42;
    private const int VersionId = 7;
    private static readonly DateTime Now = new(2026, 8, 18, 12, 0, 0, DateTimeKind.Utc);

    private readonly Mock<IAssetDerivationRepository> _derivations = new();
    private readonly Mock<IAssetPartRepository> _parts = new();
    private readonly Mock<IModelVersionRepository> _versions = new();
    private readonly Mock<IAssetSearchDocumentRepository> _documents = new();
    private readonly Mock<IDateTimeProvider> _clock = new();
    private readonly Mock<IUnitOfWork> _uow = new();
    private readonly ReprojectSearchDocumentsCommandHandler _handler;

    private readonly List<AssetSearchDocument> _written = new();

    public ReprojectSearchDocumentsCommandTests()
    {
        _clock.Setup(x => x.UtcNow).Returns(Now);
        _documents
            .Setup(x => x.AddAsync(It.IsAny<AssetSearchDocument>(), It.IsAny<CancellationToken>()))
            .Callback<AssetSearchDocument, CancellationToken>((doc, _) => _written.Add(doc))
            .Returns(Task.CompletedTask);

        _handler = new ReprojectSearchDocumentsCommandHandler(
            _derivations.Object,
            _parts.Object,
            _versions.Object,
            _documents.Object,
            _clock.Object,
            _uow.Object);
    }

    // -- fixtures ----------------------------------------------------------------------

    private static DerivedAsset Derived(params string[] tokens) => new(
        DeriveVersion: 3,
        Tokens: tokens.Length > 0 ? tokens : new[] { "carpet" },
        OriginConvention: null,
        OriginInBounds: new[] { 0.5, 0.0, 0.5 },
        GridSize: null,
        ModularKit: false,
        ShapeClass: "flat",
        LodChains: Array.Empty<DerivedLodChain>(),
        QualityFlags: Array.Empty<string>(),
        BrowseSummary: "carpet - mesh, 110 tris",
        Unnamed: false,
        Parts: new[]
        {
            new DerivedPart(
                PartPath: "/scene/carpet",
                Tokens: new[] { "carpet" },
                Prominence: "full",
                ShapeClass: "flat",
                InstanceGroup: null,
                InstanceRepresentative: true,
                QualityFlags: Array.Empty<string>(),
                BrowseSummary: "carpet - mesh, 110 tris"),
        });

    private static SceneGraphPartDto PartDto() => new(
        PartPath: "/scene/carpet",
        Name: "carpet",
        ParentPath: "/scene",
        Depth: 1,
        ObjectType: "mesh",
        TriangleCount: 110,
        VertexCount: 64,
        GeometryHash: "abc123",
        HasUvs: true,
        Detail: JsonDocument.Parse("""{"uvBounds":{"minU":0,"minV":0,"maxU":1,"maxV":1}}""").RootElement.Clone());

    private static SceneGraphRollupsDto Rollups() => new(
        MeshCount: 1,
        TotalTriangles: 110,
        TotalVertices: 64,
        MaterialCount: 1,
        MaterialNames: new List<string> { "CarpetMat" },
        BoneCount: null,
        WorldBounds: new SceneGraphWorldBoundsDto(new List<double> { 1.95, 0.01, 1.95 }),
        AnimationCount: null,
        AnimationNames: new List<string>());

    /// <summary>The three stored layers, wired up the way the reprojection reads them.</summary>
    private void GivenStoredModel(string? payload = null, string modelName = "Persian Carpet")
    {
        var model = Model.Create(modelName, Now).WithId(ModelId);
        var version = ModelVersion.Create(ModelId, 1, null, Now).WithId(VersionId);
        var rollups = Rollups();
        var dims = rollups.WorldBounds!.Dimensions!;
        version.UpdateTechnicalMetadata(
            rollups.MaterialNames, rollups.TotalTriangles, rollups.TotalVertices,
            rollups.MeshCount, rollups.MaterialCount,
            dims[0], dims[1], dims[2],
            rollups.AnimationCount, rollups.AnimationNames, rollups.BoneCount, Now);
        version.Model = model;
        // Straight onto the property: SetActiveVersion insists the version is already in the
        // model's loaded collection, which is an EF graph concern this fixture has no use for.
        typeof(Model)
            .GetProperty(nameof(Model.ActiveVersionId))!
            .SetValue(model, VersionId);

        var derivation = AssetDerivation.Create(
            ExtractionAssetTypes.Model, ModelId, VersionId, 3,
            payload ?? JsonSerializer.Serialize(Derived()), Now);

        _derivations
            .Setup(x => x.GetDerivedKeysAsync(ExtractionAssetTypes.Model, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<(int, int?)> { (ModelId, VersionId) });
        _derivations
            .Setup(x => x.GetForActiveVersionAsync(ExtractionAssetTypes.Model, ModelId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(derivation);
        _derivations
            .Setup(x => x.GetByKeyAsync(ExtractionAssetTypes.Model, ModelId, VersionId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(derivation);

        _versions
            .Setup(x => x.GetByIdAsync(VersionId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(version);

        var dto = PartDto();
        var part = AssetPart.Create(
            ExtractionAssetTypes.Model, ModelId, VersionId,
            dto.PartPath, dto.Name, dto.Depth, dto.ObjectType, Now,
            parentPath: dto.ParentPath,
            triangleCount: dto.TriangleCount,
            vertexCount: dto.VertexCount,
            geometryHash: dto.GeometryHash,
            geometryHashVersion: 1,
            hasUvs: dto.HasUvs,
            detail: dto.Detail?.GetRawText());

        _parts
            .Setup(x => x.GetForAssetAsync(
                ExtractionAssetTypes.Model, ModelId, VersionId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<AssetPart> { part });
    }

    // -- the claim the feature rests on --------------------------------------------------

    /// <summary>
    /// Reading the stored layers back has to reach the same documents the extraction path
    /// wrote. If it does not, a reindex silently rewrites the library into a different
    /// index than an extraction would - and nothing would say so.
    /// </summary>
    [Fact]
    public async Task Reprojecting_Reproduces_What_The_Extraction_Path_Indexed()
    {
        GivenStoredModel();

        var fromExtraction = SearchDocumentBuilder.BuildForModel(
            ModelId, VersionId, isCurrentVersion: true, "Persian Carpet",
            Derived(), Rollups(), new[] { PartDto() }, Now,
            assetDimensions: new[] { 1.95, 0.01, 1.95 });

        var result = await _handler.Handle(new ReprojectSearchDocumentsCommand(ModelId), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(fromExtraction.Count, _written.Count);

        foreach (var (expected, actual) in fromExtraction.Zip(_written))
        {
            Assert.Equal(expected.PartPath, actual.PartPath);
            Assert.Equal(expected.DisplayName, actual.DisplayName);
            Assert.Equal(expected.Tokens, actual.Tokens);
            Assert.Equal(expected.BrowseSummary, actual.BrowseSummary);
            Assert.Equal(expected.TriangleCount, actual.TriangleCount);
            Assert.Equal(expected.VertexCount, actual.VertexCount);
            Assert.Equal(expected.HasUvs, actual.HasUvs);
            Assert.Equal(expected.UvStatus, actual.UvStatus);
            Assert.Equal(expected.MaxDimension, actual.MaxDimension);
            Assert.Equal(expected.ScaleConvention, actual.ScaleConvention);
            Assert.Equal(expected.GeometryKey, actual.GeometryKey);
            Assert.Equal(expected.Prominence, actual.Prominence);
            Assert.Equal(expected.IsCurrentVersion, actual.IsCurrentVersion);
        }
    }

    /// <summary>
    /// The reason the operation exists: a synonym added to the vocabulary reaches the stored
    /// index without anything being re-extracted.
    /// </summary>
    [Fact]
    public async Task Reprojecting_Applies_The_Current_Vocabulary()
    {
        GivenStoredModel();

        var result = await _handler.Handle(new ReprojectSearchDocumentsCommand(ModelId), CancellationToken.None);

        Assert.True(result.IsSuccess);
        var asset = Assert.Single(_written, d => d.PartPath == null);
        Assert.Contains("rug", asset.Tokens.Split(' '));      // the synonym, added at index time
        Assert.Contains("carpet", asset.Tokens.Split(' '));   // and the word actually authored
    }

    [Fact]
    public async Task Reprojecting_Replaces_The_Assets_Documents_Rather_Than_Adding_To_Them()
    {
        GivenStoredModel();

        await _handler.Handle(new ReprojectSearchDocumentsCommand(ModelId), CancellationToken.None);

        _documents.Verify(
            x => x.RemoveForAssetAsync(
                ExtractionAssetTypes.Model, ModelId, VersionId, It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task Reprojecting_The_Whole_Library_Walks_Every_Derived_Key()
    {
        GivenStoredModel();

        var result = await _handler.Handle(new ReprojectSearchDocumentsCommand(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value.Reprojected);
        Assert.Equal(_written.Count, result.Value.DocumentsWritten);
        Assert.Equal(0, result.Value.Skipped);
        _derivations.Verify(
            x => x.GetDerivedKeysAsync(ExtractionAssetTypes.Model, It.IsAny<CancellationToken>()),
            Times.Once);
    }

    // -- refusals and survivable damage --------------------------------------------------

    [Fact]
    public async Task A_Model_That_Was_Never_Derived_Is_Refused_With_The_Way_Forward()
    {
        _derivations
            .Setup(x => x.GetForActiveVersionAsync(ExtractionAssetTypes.Model, 99, It.IsAny<CancellationToken>()))
            .ReturnsAsync((AssetDerivation?)null);

        var result = await _handler.Handle(new ReprojectSearchDocumentsCommand(99), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("NotDerived", result.Error.Code);
        Assert.Contains("trigger_rederive", result.Error.Message);
    }

    [Fact]
    public async Task A_Non_Positive_Model_Id_Is_Refused_Rather_Than_Read_As_The_Whole_Library()
    {
        var result = await _handler.Handle(new ReprojectSearchDocumentsCommand(0), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("InvalidModelId", result.Error.Code);
    }

    /// <summary>
    /// One asset with an unreadable payload must not abandon a library-wide rebuild - that
    /// would leave the index half-rewritten with no way to tell which half.
    /// </summary>
    [Fact]
    public async Task An_Unreadable_Payload_Is_Skipped_And_Named_Rather_Than_Failing_The_Run()
    {
        GivenStoredModel(payload: "{ this is not json");

        var result = await _handler.Handle(new ReprojectSearchDocumentsCommand(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(0, result.Value.Reprojected);
        Assert.Equal(1, result.Value.Skipped);
        Assert.Contains($"Model {ModelId}", Assert.Single(result.Value.Notes));
        Assert.Empty(_written);
    }

    [Fact]
    public async Task A_Version_That_No_Longer_Exists_Is_Skipped_And_Named()
    {
        GivenStoredModel();
        _versions
            .Setup(x => x.GetByIdAsync(VersionId, It.IsAny<CancellationToken>()))
            .ReturnsAsync((ModelVersion?)null);

        var result = await _handler.Handle(new ReprojectSearchDocumentsCommand(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value.Skipped);
        Assert.Contains("no longer exists", Assert.Single(result.Value.Notes));
    }
}
