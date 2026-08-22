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

/// <summary>
/// Prompt 16-D: sounds and sprites were the last two families with no tags and no
/// description at all.
/// </summary>
public class SoundAndSpriteMetadataTests
{
    private static Sound NewSound() =>
        Sound.Create("Footstep", AudioFile(), duration: 0.4, peaks: null, DateTime.UtcNow);

    private static Domain.Models.File AudioFile() =>
        Domain.Models.File.Create(
            "clip.wav", "stored_clip.wav", "/path/to/clip.wav", "audio/wav",
            Domain.ValueObjects.FileType.Wav, 88200L,
            "c3d4e5f6789012345678901234567890123456789012345678901234a1b2c3d4",
            DateTime.UtcNow);

    [Fact]
    public void SetMetadata_AssignsTagsAndDescription()
    {
        var sound = NewSound();
        var now = DateTime.UtcNow;

        sound.SetMetadata(
            new[] { ModelTag.Create("footstep", now), ModelTag.Create("gravel", now) },
            "  A single footstep on gravel.  ",
            now);

        Assert.Equal(new[] { "footstep", "gravel" }, sound.Tags.Select(t => t.Name));
        Assert.Equal("A single footstep on gravel.", sound.Description);
    }

    [Fact]
    public void SetMetadata_DropsTagsThatNormalizeToTheSameThing()
    {
        var sound = NewSound();
        var now = DateTime.UtcNow;

        sound.SetMetadata(
            new[] { ModelTag.Create("Gravel", now), ModelTag.Create("gravel", now) },
            null,
            now);

        // Normalization is what makes "Gravel" and "gravel" one tag; keeping both would put
        // the same word on the asset twice.
        Assert.Single(sound.Tags);
    }

    [Fact]
    public void SetMetadata_ReplacesRatherThanAppends()
    {
        var sound = NewSound();
        var now = DateTime.UtcNow;

        sound.SetMetadata(new[] { ModelTag.Create("old", now) }, "old", now);
        sound.SetMetadata(new[] { ModelTag.Create("new", now) }, null, now);

        Assert.Equal(new[] { "new" }, sound.Tags.Select(t => t.Name));
        Assert.Null(sound.Description);
    }
}
