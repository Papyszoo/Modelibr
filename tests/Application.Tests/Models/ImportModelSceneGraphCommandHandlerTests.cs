using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Extraction.Derivation;
using Application.Models;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Moq;
using Xunit;

namespace Application.Tests.Models;

public class ImportModelSceneGraphCommandHandlerTests
{
    private const string ValidHash = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

    private readonly Mock<IModelVersionRepository> _versions = new();
    private readonly Mock<IAssetPartRepository> _parts = new();
    private readonly Mock<IAssetExtractionRepository> _extractions = new();
    private readonly Mock<IAssetDerivationRepository> _derivations = new();
    private readonly Mock<IAssetSearchDocumentRepository> _searchDocs = new();
    private readonly Mock<IDateTimeProvider> _clock = new();
    private readonly Mock<IUnitOfWork> _uow = new();
    private readonly ImportModelSceneGraphCommandHandler _handler;

    public ImportModelSceneGraphCommandHandlerTests()
    {
        _clock.Setup(x => x.UtcNow).Returns(new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));
        _searchDocs
            .Setup(x => x.GetForOtherVersionsAsync(It.IsAny<string>(), It.IsAny<int>(), It.IsAny<int?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<AssetSearchDocument>());
        _handler = new ImportModelSceneGraphCommandHandler(
            _versions.Object, _parts.Object, _extractions.Object, _derivations.Object,
            _searchDocs.Object, new DerivationOptions(), _clock.Object, _uow.Object);
    }

    private static SceneGraphPartDto Part(string path, string type, int? tris = null, string? hash = null) =>
        new(path, path.Split('/')[^1], "/", 1, type, tris, tris, hash, hash is null ? null : true, null);

    private ImportModelSceneGraphCommand Command(List<string>? warnings = null) => new(
        1, ValidHash, ExtractorVersion: 1, GeometryHashVersion: 1, SchemaVersion: 1, RawPayload: "{}",
        new SceneGraphRollupsDto(
            MeshCount: 2, TotalTriangles: 100, TotalVertices: 50, MaterialCount: 2,
            MaterialNames: new List<string> { "Wood", "Fabric" }, BoneCount: 1,
            WorldBounds: new SceneGraphWorldBoundsDto(new List<double> { 1.0, 2.0, 3.0 }),
            AnimationCount: 1, AnimationNames: new List<string> { "Idle" }),
        new List<SceneGraphPartDto>
        {
            Part("/Chair/Leg[0]", "mesh", 40, "aaaa000000000000"),
            Part("/Chair/Seat", "mesh", 60, "bbbb000000000000"),
        },
        warnings ?? new List<string>());

    private void SetupVersion()
    {
        var version = ModelVersion.Create(1, 1, "v1", DateTime.UtcNow);
        version.WithId(1);
        _versions.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync(version);
        _versions.Setup(x => x.UpdateAsync(It.IsAny<ModelVersion>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ModelVersion mv, CancellationToken _) => mv);
    }

    [Fact]
    public async Task Handle_WhenVersionMissing_ReturnsFailure()
    {
        _versions.Setup(x => x.GetByIdAsync(1, It.IsAny<CancellationToken>())).ReturnsAsync((ModelVersion?)null);

        var result = await _handler.Handle(Command(), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("ModelVersionNotFound", result.Error.Code);
    }

    [Fact]
    public async Task Handle_WhenHashInvalid_ReturnsFailure()
    {
        var command = Command() with { FileSha256 = "too-short" };

        var result = await _handler.Handle(command, CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("InvalidFileHash", result.Error.Code);
    }

    [Fact]
    public async Task Handle_RefreshesFlatProjectionFromRollups()
    {
        SetupVersion();

        var result = await _handler.Handle(Command(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        _versions.Verify(x => x.UpdateAsync(It.Is<ModelVersion>(v =>
            v.TriangleCount == 100 &&
            v.MeshCount == 2 &&
            v.BoneCount == 1 &&
            v.BoundingBoxX == 1.0 &&
            v.BoundingBoxZ == 3.0 &&
            v.MaterialNames.Count == 2),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_ReplacesPartsThenAddsEach()
    {
        SetupVersion();

        var result = await _handler.Handle(Command(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        _parts.Verify(x => x.RemoveForAssetAsync("Model", 1, 1, It.IsAny<CancellationToken>()), Times.Once);
        _parts.Verify(x => x.AddAsync(It.IsAny<AssetPart>(), It.IsAny<CancellationToken>()), Times.Exactly(2));
    }

    [Fact]
    public async Task Handle_UpsertsRawExtraction_PartialWhenWarnings()
    {
        SetupVersion();

        var result = await _handler.Handle(Command(warnings: new List<string> { "unresolved image" }), CancellationToken.None);

        Assert.True(result.IsSuccess);
        _extractions.Verify(x => x.AddAsync(It.Is<AssetExtraction>(e =>
            e.FileSha256 == ValidHash &&
            e.Outcome == ExtractionOutcome.Partial &&
            e.GeometryHashVersion == 1),
            It.IsAny<CancellationToken>()), Times.Once);
        _uow.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_RawExtractionComplete_WhenNoWarnings()
    {
        SetupVersion();

        await _handler.Handle(Command(), CancellationToken.None);

        _extractions.Verify(x => x.AddAsync(It.Is<AssetExtraction>(e =>
            e.Outcome == ExtractionOutcome.Complete), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_UpsertsDerivedLayer_ForModelVersion()
    {
        SetupVersion();

        var result = await _handler.Handle(Command(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        _derivations.Verify(x => x.AddAsync(It.Is<AssetDerivation>(d =>
            d.AssetType == "Model" &&
            d.AssetId == 1 &&
            d.VersionId == 1 &&
            d.DeriveVersion >= 1 &&
            d.Payload.Contains("browseSummary", StringComparison.OrdinalIgnoreCase)),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_RebuildsSearchProjection_AssetPlusParts()
    {
        SetupVersion();

        var result = await _handler.Handle(Command(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        // Replace-then-add semantics: clears this version's docs first.
        _searchDocs.Verify(x => x.RemoveForAssetAsync("Model", 1, 1, It.IsAny<CancellationToken>()), Times.Once);
        // One asset-level doc (PartPath null) + one per non-hidden part (2 parts).
        _searchDocs.Verify(x => x.AddAsync(It.Is<AssetSearchDocument>(d => d.PartPath == null && d.IsCurrentVersion),
            It.IsAny<CancellationToken>()), Times.Once);
        _searchDocs.Verify(x => x.AddAsync(It.IsAny<AssetSearchDocument>(), It.IsAny<CancellationToken>()), Times.Exactly(3));
    }

    /// <summary>A version whose parent model exists, with the given active version.</summary>
    private ModelVersion SetupVersionWithModel(int versionId, int activeVersionId)
    {
        var model = Model.Create("Chair", DateTime.UtcNow).WithId(1);
        // Set the FK directly: SetActiveVersion validates against the loaded Versions
        // collection, which a repository read for this handler does not populate.
        typeof(Model)
            .GetProperty(nameof(Model.ActiveVersionId))!
            .SetValue(model, activeVersionId);

        var version = ModelVersion.Create(1, 1, "v1", DateTime.UtcNow).WithId(versionId);
        version.Model = model;
        _versions.Setup(x => x.GetByIdAsync(versionId, It.IsAny<CancellationToken>())).ReturnsAsync(version);
        _versions.Setup(x => x.UpdateAsync(It.IsAny<ModelVersion>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ModelVersion mv, CancellationToken _) => mv);
        return version;
    }

    [Fact]
    public async Task Handle_MarksTheVersionCurrentOnlyWhenItIsTheModelsActiveVersion()
    {
        // Regression: every extraction claimed the current-version marker, so whichever
        // job finished LAST decided what search returned. A delayed job for an old
        // version, an upload against a non-active version, or a re-derive could all
        // silently swap the asset's searchable version.
        SetupVersionWithModel(versionId: 1, activeVersionId: 2);

        var result = await _handler.Handle(Command(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        _searchDocs.Verify(
            x => x.AddAsync(It.Is<AssetSearchDocument>(d => d.IsCurrentVersion), It.IsAny<CancellationToken>()),
            Times.Never);
        // Nor may a non-active version clear the marker on the version that IS active.
        _searchDocs.Verify(
            x => x.GetForOtherVersionsAsync(It.IsAny<string>(), It.IsAny<int>(), It.IsAny<int?>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_MarksTheActiveVersionCurrentAndClearsTheOthers()
    {
        SetupVersionWithModel(versionId: 1, activeVersionId: 1);

        var result = await _handler.Handle(Command(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        _searchDocs.Verify(
            x => x.AddAsync(It.Is<AssetSearchDocument>(d => d.PartPath == null && d.IsCurrentVersion), It.IsAny<CancellationToken>()),
            Times.Once);
        _searchDocs.Verify(
            x => x.GetForOtherVersionsAsync("Model", 1, 1, It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task Handle_KeepsARecycledModelOutOfSearchAfterReExtraction()
    {
        var version = SetupVersionWithModel(versionId: 1, activeVersionId: 1);
        version.Model.SoftDelete(DateTime.UtcNow);

        var result = await _handler.Handle(Command(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        _searchDocs.Verify(
            x => x.AddAsync(It.Is<AssetSearchDocument>(d => d.IsActive), It.IsAny<CancellationToken>()),
            Times.Never);
    }
}
