using System.Text.Json;
using Application.StoreImports;
using Xunit;

namespace Application.Tests.StoreImports;

/// <summary>
/// The store manifest is an external contract: the store may send the newer per-item
/// descriptive fields, and Modelibr may talk to a store that predates them. Both shapes have
/// to deserialize.
/// </summary>
public class StoreManifestTests
{
    // Mirrors StoreImportClient.ManifestJsonOptions - the client deserializes the manifest
    // case-insensitively, and the record's positional constructor is what binds the JSON
    // properties onto it.
    private static readonly JsonSerializerOptions Options = new() { PropertyNameCaseInsensitive = true };

    [Fact]
    public void Deserialize_ItemCarriesTheDescriptiveFields()
    {
        const string json = """
        {
          "schemaVersion": 1,
          "title": "Medieval Weapons",
          "items": [
            {
              "id": "item-1",
              "itemType": "Model",
              "name": "Arrow",
              "files": [],
              "previews": [],
              "metadataJson": "{\"category\":\"Weapons\"}",
              "description": "Arrow ranged weapon",
              "tags": ["arrow", "weapons", "ranged"],
              "category": "Weapons",
              "subcategory": "Ranged",
              "styles": ["Low Poly", "Stylized"],
              "themes": ["Medieval"]
            }
          ]
        }
        """;

        var manifest = JsonSerializer.Deserialize<StoreManifest>(json, Options)!;

        var item = Assert.Single(manifest.Items!);
        Assert.Equal("Arrow ranged weapon", item.Description);
        Assert.Equal(new[] { "arrow", "weapons", "ranged" }, item.Tags);
        Assert.Equal("Weapons", item.Category);
        Assert.Equal("Ranged", item.Subcategory);
        Assert.Equal(new[] { "Low Poly", "Stylized" }, item.Styles);
        Assert.Equal(new[] { "Medieval" }, item.Themes);
    }

    [Fact]
    public void Deserialize_OlderManifestWithoutDescriptiveFields_StillWorks()
    {
        // No description/tags/category/styles/themes at the item level - the schema-v1 shape
        // the importer understood before the store added them.
        const string json = """
        {
          "schemaVersion": 1,
          "title": "Medieval Weapons",
          "items": [
            {
              "itemType": "Model",
              "name": "Arrow",
              "files": [],
              "previews": [],
              "metadataJson": "{\"category\":\"Weapons\"}"
            }
          ]
        }
        """;

        var manifest = JsonSerializer.Deserialize<StoreManifest>(json, Options)!;

        var item = Assert.Single(manifest.Items!);
        Assert.Equal("Arrow", item.Name);
        Assert.Null(item.Description);
        Assert.Null(item.Tags);
        Assert.Null(item.Category);
        Assert.Null(item.Subcategory);
        Assert.Null(item.Styles);
        Assert.Null(item.Themes);
        // The older category home is untouched.
        Assert.Equal("Weapons", StoreManifestMapping.GetItemCategory(item.MetadataJson));
    }
}
