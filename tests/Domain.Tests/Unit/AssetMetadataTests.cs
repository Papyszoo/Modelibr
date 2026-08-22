using Domain.Models;
using Xunit;

namespace Domain.Tests.Unit;

public class AssetMetadataTests
{
    private static AssetMetadata New() =>
        AssetMetadata.Create("Model", 1, 1, DateTime.UtcNow);

    [Fact]
    public void Create_RejectsAnAssetItCouldNeverDescribe()
    {
        Assert.Throws<ArgumentException>(() => AssetMetadata.Create("", 1, 1, DateTime.UtcNow));
        Assert.Throws<ArgumentException>(() => AssetMetadata.Create("Model", 0, 1, DateTime.UtcNow));
    }

    [Fact]
    public void SetDescriptive_DropsBlanksAndDuplicates()
    {
        var metadata = New();

        metadata.SetDescriptive(
            " a chair ",
            new[] { "oak", "  ", "Oak", "chair" },
            new[] { "Low Poly", "Low Poly" },
            null,
            DateTime.UtcNow);

        Assert.Equal("a chair", metadata.Description);
        Assert.Equal(new[] { "oak", "chair" }, metadata.Tags);
        Assert.Equal(new[] { "Low Poly" }, metadata.Styles);
        Assert.Empty(metadata.Themes);
    }

    [Fact]
    public void BlankStrings_ReadAsAbsent()
    {
        var metadata = New();

        metadata.SetRights("  ", null, "", "Kenney", null, null, null, DateTime.UtcNow);

        // Storing "" would make the field read as filled while saying nothing, and
        // completeness is measured by "is this null".
        Assert.Null(metadata.License);
        Assert.Null(metadata.LicenseUrl);
        Assert.Equal("Kenney", metadata.Author);
    }

    [Fact]
    public void SetFacets_EmptyJson_ClearsRatherThanStoringBlank()
    {
        var metadata = New();

        metadata.SetFacets("{\"fps\":7}", DateTime.UtcNow);
        Assert.NotNull(metadata.FacetsJson);

        metadata.SetFacets("   ", DateTime.UtcNow);
        Assert.Null(metadata.FacetsJson);
    }

    [Fact]
    public void EveryWrite_MovesUpdatedAt()
    {
        var created = new DateTime(2026, 8, 1, 0, 0, 0, DateTimeKind.Utc);
        var metadata = AssetMetadata.Create("Model", 1, 1, created);
        var later = created.AddDays(1);

        metadata.SetProvenance("Store Import", null, "https://store", "abc", "item", later, later);

        Assert.Equal(created, metadata.CreatedAt);
        Assert.Equal(later, metadata.UpdatedAt);
    }

}

/// <summary>The projection side of the metadata-schema facets (prompt 16-F).</summary>
public class AssetSearchDocumentFacetTests
{
    private static AssetSearchDocument Document(
        IEnumerable<string>? styles = null, string? license = null) =>
        AssetSearchDocument.Create(
            "Model", 1, 1, null, isCurrentVersion: true, "full", "Chair",
            "chair", "A chair", DateTime.UtcNow, styles: styles, license: license);

    [Fact]
    public void Facets_AreTrimmedDeduplicatedAndSorted()
    {
        var document = Document(new[] { "Voxel", " Low Poly ", "Voxel", "" });

        // Sorted so the stored array depends on WHICH values the asset carries, not on the
        // order a caller happened to assemble them.
        Assert.Equal(new[] { "Low Poly", "Voxel" }, document.Styles);
    }

    [Fact]
    public void AnAssetNobodyDescribed_HasEmptyFacetsNotNullOnes()
    {
        var document = Document();

        // Empty, never null: the filter is an array containment test, and a null column
        // would drop the document out of every query instead of just not matching.
        Assert.Empty(document.Styles);
        Assert.Empty(document.Themes);
        Assert.Null(document.License);
    }

    [Fact]
    public void SetSchemaFacets_ReplacesWholesale()
    {
        var document = Document(new[] { "Voxel" }, "CC-BY");

        document.SetSchemaFacets(new[] { "Realistic" }, null, null);

        Assert.Equal(new[] { "Realistic" }, document.Styles);
        Assert.Null(document.License);
    }
}
