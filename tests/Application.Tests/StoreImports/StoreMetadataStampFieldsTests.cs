using System.Text.Json;
using Application.StoreImports;
using Xunit;

namespace Application.Tests.StoreImports;

public class StoreMetadataStampFieldsTests
{
    private static readonly DateTime ImportedAt = new(2026, 8, 22, 12, 0, 0, DateTimeKind.Utc);

    private static StoreAssetMetadataStamp Stamp(
        string? license = "CC-BY",
        string? author = "Kenney",
        string? facetsJson = null)
        => new(
            License: license,
            LicenseName: "CC BY 4.0",
            Author: author,
            CreditName: "Kenney.nl",
            CreditUrl: "https://kenney.nl",
            AttributionRequired: true,
            SourceUrl: "https://store.example/assets/abc",
            StoreUrl: "https://store.example",
            StoreAssetId: "abc",
            StoreItemId: "item-1",
            ImportedAt: ImportedAt,
            FacetsJson: facetsJson);

    private static string? Text(IReadOnlyDictionary<string, JsonElement> fields, string key)
        => fields.TryGetValue(key, out var value) ? value.GetString() : null;

    [Fact]
    public void FirstImport_CarriesEverythingTheManifestKnew()
    {
        var fields = StoreMetadataStampFields.Build("Model", Stamp(), Array.Empty<string>());

        Assert.Equal("CC-BY", Text(fields, "license"));
        Assert.Equal("CC BY 4.0", Text(fields, "licenseName"));
        Assert.Equal("Kenney", Text(fields, "author"));
        Assert.Equal("Kenney.nl", Text(fields, "creditName"));
        Assert.True(fields["attributionRequired"].GetBoolean());
        Assert.Equal("Store Import", Text(fields, "sourceKind"));
        Assert.Equal("item-1", Text(fields, "storeItemId"));
    }

    /// <summary>
    /// Re-running an import must not undo a licence someone corrected by hand - the same
    /// rule the category gap-fill has always followed.
    /// </summary>
    [Fact]
    public void Rights_AlreadyPresent_AreNotOverwritten()
    {
        var fields = StoreMetadataStampFields.Build(
            "Model", Stamp(), new[] { "license", "author" });

        Assert.False(fields.ContainsKey("license"));
        Assert.False(fields.ContainsKey("author"));
        // The ones nobody had filled still land.
        Assert.Equal("Kenney.nl", Text(fields, "creditName"));
    }

    [Fact]
    public void Provenance_IsAlwaysRestamped()
    {
        var fields = StoreMetadataStampFields.Build(
            "Model", Stamp(), new[] { "storeUrl", "storeAssetId", "storeItemId", "sourceKind", "importedAt" });

        Assert.Equal("https://store.example", Text(fields, "storeUrl"));
        Assert.Equal("abc", Text(fields, "storeAssetId"));
        Assert.Equal("item-1", Text(fields, "storeItemId"));
        Assert.Equal("Store Import", Text(fields, "sourceKind"));
    }

    [Fact]
    public void Rights_TheManifestDidNotCarry_AreNotWrittenAsNull()
    {
        var fields = StoreMetadataStampFields.Build(
            "Model", Stamp(license: null, author: null), Array.Empty<string>());

        // An absent value must stay absent: writing null would CLEAR the field on a
        // re-import, which is the opposite of gap-fill.
        Assert.False(fields.ContainsKey("license"));
        Assert.False(fields.ContainsKey("author"));
    }

    [Fact]
    public void Facets_LandOnlyOnAFamilyThatDeclaresThem()
    {
        const string facets = """{"frameWidth":58,"frameCount":26,"spritesheetType":"animation"}""";

        var onSprite = StoreMetadataStampFields.Build("Sprite", Stamp(facetsJson: facets), Array.Empty<string>());
        var onModel = StoreMetadataStampFields.Build("Model", Stamp(facetsJson: facets), Array.Empty<string>());

        Assert.Equal(58, onSprite["frameWidth"].GetInt32());
        Assert.Equal("animation", Text(onSprite, "spritesheetType"));
        Assert.False(onModel.ContainsKey("frameWidth"));
    }

    [Fact]
    public void Facets_ThatDoNotParse_AreIgnoredRatherThanFailing()
    {
        var fields = StoreMetadataStampFields.Build(
            "Sprite", Stamp(facetsJson: "not json"), Array.Empty<string>());

        Assert.Equal("CC-BY", Text(fields, "license"));
        Assert.False(fields.ContainsKey("frameWidth"));
    }
}
