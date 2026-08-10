using Domain.Models;
using Domain.ValueObjects;
using Xunit;

namespace Domain.Tests.Unit;

public class AssetExtractionDomainTests
{
    private const string ValidHash = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

    [Fact]
    public void Create_WithValidParameters_SetsFields()
    {
        var at = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

        var extraction = AssetExtraction.Create(
            "Model", 5, versionId: 12, ValidHash, "{\"a\":1}",
            extractorVersion: 2, schemaVersion: 1, extractedAt: at,
            geometryHashVersion: 3);

        Assert.Equal("Model", extraction.AssetType);
        Assert.Equal(5, extraction.AssetId);
        Assert.Equal(12, extraction.VersionId);
        Assert.Equal(ValidHash, extraction.FileSha256);
        Assert.Equal("{\"a\":1}", extraction.RawPayload);
        Assert.Equal(2, extraction.ExtractorVersion);
        Assert.Equal(3, extraction.GeometryHashVersion);
        Assert.Equal(ExtractionOutcome.Complete, extraction.Outcome);
        Assert.Empty(extraction.Warnings);
        Assert.Equal(at, extraction.ExtractedAt);
    }

    [Fact]
    public void Create_WithNullVersionId_IsAllowedForNonVersionedAssets()
    {
        var extraction = AssetExtraction.Create(
            "Sound", 7, versionId: null, ValidHash, "{}", 1, 1, DateTime.UtcNow);

        Assert.Null(extraction.VersionId);
    }

    [Theory]
    [InlineData("short")]
    [InlineData("")]
    public void Create_WithInvalidHash_Throws(string hash)
    {
        Assert.Throws<ArgumentException>(() =>
            AssetExtraction.Create("Model", 1, 1, hash, "{}", 1, 1, DateTime.UtcNow));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-3)]
    public void Create_WithInvalidAssetId_Throws(int assetId)
    {
        Assert.Throws<ArgumentException>(() =>
            AssetExtraction.Create("Model", assetId, 1, ValidHash, "{}", 1, 1, DateTime.UtcNow));
    }

    [Fact]
    public void Create_WithExtractorVersionBelowOne_Throws()
    {
        Assert.Throws<ArgumentException>(() =>
            AssetExtraction.Create("Model", 1, 1, ValidHash, "{}", 0, 1, DateTime.UtcNow));
    }

    [Fact]
    public void Create_WithEmptyPayload_DefaultsToEmptyJsonObject()
    {
        var extraction = AssetExtraction.Create("Model", 1, 1, ValidHash, "  ", 1, 1, DateTime.UtcNow);
        Assert.Equal("{}", extraction.RawPayload);
    }

    [Fact]
    public void Create_NormalizesWarnings_TrimmingAndDroppingBlanks()
    {
        var extraction = AssetExtraction.Create(
            "Model", 1, 1, ValidHash, "{}", 1, 1, DateTime.UtcNow,
            outcome: ExtractionOutcome.Partial,
            warnings: new[] { " missing texture ", "", "   ", "non-manifold" });

        Assert.Equal(ExtractionOutcome.Partial, extraction.Outcome);
        Assert.Equal(new[] { "missing texture", "non-manifold" }, extraction.Warnings);
    }

    [Fact]
    public void UpdatePayload_ReplacesPayloadAndVersionsInPlace()
    {
        var first = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var extraction = AssetExtraction.Create("Model", 1, 1, ValidHash, "{\"v\":1}", 1, 1, first);

        var later = first.AddHours(2);
        extraction.UpdatePayload("{\"v\":2}", extractorVersion: 4, schemaVersion: 2, extractedAt: later,
            geometryHashVersion: 5, outcome: ExtractionOutcome.Partial, warnings: new[] { "warn" });

        Assert.Equal("{\"v\":2}", extraction.RawPayload);
        Assert.Equal(4, extraction.ExtractorVersion);
        Assert.Equal(2, extraction.SchemaVersion);
        Assert.Equal(5, extraction.GeometryHashVersion);
        Assert.Equal(ExtractionOutcome.Partial, extraction.Outcome);
        Assert.Equal(new[] { "warn" }, extraction.Warnings);
        Assert.Equal(later, extraction.ExtractedAt);
        Assert.Equal(later, extraction.UpdatedAt);
    }
}
