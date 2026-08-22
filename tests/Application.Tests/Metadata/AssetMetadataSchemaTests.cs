using Application.Metadata;
using Xunit;

namespace Application.Tests.Metadata;

public class AssetMetadataSchemaTests
{
    [Theory]
    [InlineData("Model")]
    [InlineData("TextureSet")]
    [InlineData("Sprite")]
    [InlineData("Sound")]
    [InlineData("Material")]
    [InlineData("EnvironmentMap")]
    public void EveryFamily_CarriesTheUniversalBlocks(string family)
    {
        var keys = AssetMetadataSchema.ForFamily(family).Select(f => f.Key).ToHashSet();

        // The whole point of the schema is that these are not per-family accidents any more.
        Assert.Contains("description", keys);
        Assert.Contains("tags", keys);
        Assert.Contains("category", keys);
        Assert.Contains("styles", keys);
        Assert.Contains("license", keys);
        Assert.Contains("author", keys);
        Assert.Contains("creditName", keys);
        Assert.Contains("storeItemId", keys);
    }

    [Theory]
    [InlineData("Model")]
    [InlineData("TextureSet")]
    [InlineData("Sprite")]
    [InlineData("Sound")]
    [InlineData("Material")]
    [InlineData("EnvironmentMap")]
    public void FieldKeys_AreUniquePerFamily(string family)
    {
        var fields = AssetMetadataSchema.ForFamily(family);
        Assert.Equal(fields.Count, fields.Select(f => f.Key).Distinct(StringComparer.Ordinal).Count());
    }

    /// <summary>
    /// The storage pointer is what lets one contract describe six different homes. If it
    /// ever disagrees with reality the read surface silently returns null for a field the
    /// asset actually has, so it is pinned.
    /// </summary>
    [Theory]
    [InlineData("Model", "entity")]
    [InlineData("Material", "entity")]
    [InlineData("TextureSet", "metadata")]
    [InlineData("EnvironmentMap", "metadata")]
    [InlineData("Sound", "metadata")]
    [InlineData("Sprite", "metadata")]
    public void Description_LivesWhereTheFamilyActuallyKeepsIt(string family, string expectedStorage)
    {
        Assert.Equal(expectedStorage, AssetMetadataSchema.Field(family, "description")!.Storage);
    }

    [Theory]
    [InlineData("Model", "entity")]
    [InlineData("TextureSet", "entity")]
    [InlineData("Material", "entity")]
    [InlineData("EnvironmentMap", "entity")]
    [InlineData("Sound", "metadata")]
    [InlineData("Sprite", "metadata")]
    public void Tags_LiveWhereTheFamilyActuallyKeepsThem(string family, string expectedStorage)
    {
        Assert.Equal(expectedStorage, AssetMetadataSchema.Field(family, "tags")!.Storage);
    }

    [Fact]
    public void DerivedFields_AreReadOnly()
    {
        var derived = AssetMetadataSchema
            .ForFamily("Model")
            .Where(f => f.Storage == AssetMetadataSchema.AssetMetadataStorage.Derived)
            .ToList();

        Assert.NotEmpty(derived);
        Assert.All(derived, f => Assert.True(f.ReadOnly, $"{f.Key} is measured but writable."));
    }

    [Fact]
    public void CategoryField_PointsAtItsOwnFamilysTree()
    {
        foreach (var family in AssetMetadataSchema.Families.All)
        {
            Assert.Equal(family, AssetMetadataSchema.Field(family, "category")!.CategoryFamily);
        }
    }

    [Fact]
    public void EnumFields_DeclareTheirAllowedValues()
    {
        foreach (var family in AssetMetadataSchema.Families.All)
        {
            var enums = AssetMetadataSchema.ForFamily(family)
                .Where(f => f.Type == AssetMetadataSchema.FieldTypes.Enum);

            Assert.All(enums, f =>
                Assert.True(f.AllowedValues is { Count: > 0 }, $"{family}.{f.Key} is an enum with no values."));
        }
    }

    [Fact]
    public void SpritesheetFacets_AreDeclaredOnSpritesOnly()
    {
        Assert.NotNull(AssetMetadataSchema.Field("Sprite", "frameWidth"));
        Assert.Null(AssetMetadataSchema.Field("Model", "frameWidth"));
    }

    [Theory]
    [InlineData("model", "Model")]
    [InlineData("TEXTURESET", "TextureSet")]
    [InlineData("EnvironmentMap", "EnvironmentMap")]
    public void NormalizeFamily_IsCaseInsensitive(string input, string expected)
    {
        Assert.Equal(expected, AssetMetadataSchema.NormalizeFamily(input));
    }

    [Theory]
    [InlineData("Models")]
    [InlineData("")]
    [InlineData(null)]
    public void NormalizeFamily_RejectsAnythingElse(string? input)
    {
        Assert.Null(AssetMetadataSchema.NormalizeFamily(input));
    }
}
