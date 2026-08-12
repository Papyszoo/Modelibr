using Application.Abstractions;
using Application.Abstractions.Repositories;
using Application.Extraction;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Moq;
using Xunit;

namespace Application.Tests.Extraction;

public class ImportAssetExtractionCommandHandlerTests
{
    private const string ValidHash = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

    private readonly Mock<IAssetExtractionRepository> _extractions = new();
    private readonly Mock<IDateTimeProvider> _clock = new();
    private readonly Mock<IUnitOfWork> _uow = new();
    private readonly ImportAssetExtractionCommandHandler _handler;

    public ImportAssetExtractionCommandHandlerTests()
    {
        _clock.Setup(x => x.UtcNow).Returns(new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc));
        _handler = new ImportAssetExtractionCommandHandler(_extractions.Object, _clock.Object, _uow.Object);
    }

    private static ImportAssetExtractionCommand Command(
        string assetType = ExtractionAssetTypes.TextureSet,
        int assetId = 7,
        int? versionId = null,
        string hash = ValidHash,
        ExtractionOutcome? outcome = null,
        List<string>? warnings = null) => new(
        assetType, assetId, versionId, hash, RawPayload: "{\"tileability\":0.98}",
        ExtractorVersion: 1, SchemaVersion: 1, outcome, warnings ?? new List<string>());

    [Fact]
    public async Task Handle_WhenAssetTypeIsModel_ReturnsFailure()
    {
        var result = await _handler.Handle(Command(assetType: ExtractionAssetTypes.Model), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("UnsupportedAssetType", result.Error.Code);
    }

    [Fact]
    public async Task Handle_WhenAssetTypeUnknown_ReturnsFailure()
    {
        var result = await _handler.Handle(Command(assetType: "Nonsense"), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("UnsupportedAssetType", result.Error.Code);
    }

    [Fact]
    public async Task Handle_WhenHashInvalid_ReturnsFailure()
    {
        var result = await _handler.Handle(Command(hash: "short"), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("InvalidFileHash", result.Error.Code);
    }

    [Fact]
    public async Task Handle_WhenAssetIdInvalid_ReturnsFailure()
    {
        var result = await _handler.Handle(Command(assetId: 0), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("InvalidAssetId", result.Error.Code);
    }

    [Fact]
    public async Task Handle_WhenNew_AddsExtractionWithNullGeometryHashVersion()
    {
        _extractions
            .Setup(x => x.GetByKeyAsync(It.IsAny<string>(), It.IsAny<int>(), It.IsAny<int?>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((AssetExtraction?)null);

        var result = await _handler.Handle(Command(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        _extractions.Verify(x => x.AddAsync(It.Is<AssetExtraction>(e =>
            e.AssetType == ExtractionAssetTypes.TextureSet &&
            e.AssetId == 7 &&
            e.VersionId == null &&
            e.GeometryHashVersion == null &&
            e.FileSha256 == ValidHash &&
            e.Outcome == ExtractionOutcome.Complete),
            It.IsAny<CancellationToken>()), Times.Once);
        _uow.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenWarningsPresent_DerivesPartialOutcome()
    {
        _extractions
            .Setup(x => x.GetByKeyAsync(It.IsAny<string>(), It.IsAny<int>(), It.IsAny<int?>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((AssetExtraction?)null);

        await _handler.Handle(Command(warnings: new List<string> { "normal map looks like albedo" }), CancellationToken.None);

        _extractions.Verify(x => x.AddAsync(It.Is<AssetExtraction>(e =>
            e.Outcome == ExtractionOutcome.Partial), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenExplicitOutcome_OverridesWarningDerivation()
    {
        _extractions
            .Setup(x => x.GetByKeyAsync(It.IsAny<string>(), It.IsAny<int>(), It.IsAny<int?>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((AssetExtraction?)null);

        await _handler.Handle(Command(outcome: ExtractionOutcome.Failed), CancellationToken.None);

        _extractions.Verify(x => x.AddAsync(It.Is<AssetExtraction>(e =>
            e.Outcome == ExtractionOutcome.Failed), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenExisting_UpsertsInPlace()
    {
        var existing = AssetExtraction.Create(
            ExtractionAssetTypes.TextureSet, 7, null, ValidHash, "{}", 1, 1,
            new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc));
        _extractions
            .Setup(x => x.GetByKeyAsync(ExtractionAssetTypes.TextureSet, 7, null, ValidHash, It.IsAny<CancellationToken>()))
            .ReturnsAsync(existing);

        var result = await _handler.Handle(Command(), CancellationToken.None);

        Assert.True(result.IsSuccess);
        _extractions.Verify(x => x.AddAsync(It.IsAny<AssetExtraction>(), It.IsAny<CancellationToken>()), Times.Never);
        _extractions.Verify(x => x.UpdateAsync(existing, It.IsAny<CancellationToken>()), Times.Once);
    }
}
