using System;
using System.Collections.Generic;
using System.Text.Json;
using Application.StoreImports;
using Xunit;

namespace Application.Tests.StoreImports;

public class EnrichedStoreManifestImportTests
{
    [Fact]
    public void Typed_Category_And_Subcategory_Take_Precedence_Over_MetadataJson()
    {
        var item = new StoreManifestItem(
            ItemType: "Model",
            Name: "table_oak",
            Files: null,
            Previews: null,
            Id: "item-123",
            MetadataJson: "{\"category\":\"OldCategory\",\"subcategory\":\"OldSubcategory\"}",
            Description: "A fine oak table",
            Tags: new[] { "oak", "wood" },
            Category: "Furniture",
            Subcategory: "Tables & Desks",
            Styles: new[] { "Realistic" },
            Themes: new[] { "Modern" });

        Assert.Equal("Furniture", StoreManifestMapping.ResolveItemCategory(item));
        Assert.Equal("Tables & Desks", StoreManifestMapping.ResolveItemSubcategory(item));
    }

    [Fact]
    public void Fallback_To_MetadataJson_When_Typed_Fields_Are_Missing()
    {
        var item = new StoreManifestItem(
            ItemType: "Model",
            Name: "chair_simple",
            Files: null,
            Previews: null,
            Id: "item-456",
            MetadataJson: "{\"category\":\"Furniture\",\"subcategory\":\"Seating\"}",
            Category: null,
            Subcategory: null);

        Assert.Equal("Furniture", StoreManifestMapping.ResolveItemCategory(item));
        Assert.Equal("Seating", StoreManifestMapping.ResolveItemSubcategory(item));
    }

    [Fact]
    public void Item_Description_Takes_Precedence_Over_Manifest_Description_And_Item_Name()
    {
        var manifest = new StoreManifest(
            SchemaVersion: 1,
            Title: "Furniture Pack",
            Description: "A pack containing various furniture items",
            License: "CC0",
            Tags: new[] { "furniture" },
            Items: null,
            Previews: null);

        var itemWithDesc = new StoreManifestItem(
            ItemType: "Model",
            Name: "desk_01",
            Files: null,
            Previews: null,
            Description: "Wooden writing desk with two drawers.");

        var itemWithoutDesc = new StoreManifestItem(
            ItemType: "Model",
            Name: "desk_02",
            Files: null,
            Previews: null,
            Description: null);

        var itemWithNoManifestDesc = new StoreManifestItem(
            ItemType: "Model",
            Name: "desk_03",
            Files: null,
            Previews: null,
            Description: null);

        var emptyManifest = new StoreManifest(
            SchemaVersion: 1,
            Title: "Empty Pack",
            Description: null,
            License: "CC0",
            Tags: null,
            Items: null,
            Previews: null);

        Assert.Equal("Wooden writing desk with two drawers.", StoreManifestMapping.ResolveItemDescription(itemWithDesc, manifest));
        Assert.Equal("A pack containing various furniture items", StoreManifestMapping.ResolveItemDescription(itemWithoutDesc, manifest));
        Assert.Equal("desk_03", StoreManifestMapping.ResolveItemDescription(itemWithNoManifestDesc, emptyManifest));
    }

    [Fact]
    public void Item_Tags_Take_Precedence_Over_Manifest_Tags()
    {
        var manifest = new StoreManifest(
            SchemaVersion: 1,
            Title: "Kit",
            Description: null,
            License: "CC0",
            Tags: new[] { "generic_pack_tag" },
            Items: null,
            Previews: null);

        var itemWithTags = new StoreManifestItem(
            ItemType: "Model",
            Name: "item1",
            Files: null,
            Previews: null,
            Tags: new[] { "specific_tag_1", "specific_tag_2" });

        var itemWithoutTags = new StoreManifestItem(
            ItemType: "Model",
            Name: "item2",
            Files: null,
            Previews: null,
            Tags: null);

        Assert.Equal(new[] { "specific_tag_1", "specific_tag_2" }, StoreManifestMapping.ResolveItemTags(itemWithTags, manifest));
        Assert.Equal(new[] { "generic_pack_tag" }, StoreManifestMapping.ResolveItemTags(itemWithoutTags, manifest));
    }

    [Fact]
    public void StoreMetadataStampFields_Emits_StoreItemId_And_Enriched_Facets()
    {
        var stamp = new StoreAssetMetadataStamp(
            License: "CC0",
            LicenseName: "CC0-1.0",
            Author: "Kenney",
            CreditName: "Kenney",
            CreditUrl: "https://kenney.nl",
            AttributionRequired: false,
            SourceUrl: "https://store.example/assets/pack-1",
            StoreUrl: "https://store.example",
            StoreAssetId: "pack-1",
            StoreItemId: "item-guid-12345",
            ImportedAt: DateTime.UtcNow,
            FacetsJson: "{\"styles\":[\"Low Poly\"],\"themes\":[\"Medieval\"]}");

        var fields = StoreMetadataStampFields.Build("Model", stamp, Array.Empty<string>());

        Assert.Equal("item-guid-12345", fields["storeItemId"].GetString());
        Assert.Equal("pack-1", fields["storeAssetId"].GetString());
        Assert.Equal("https://store.example", fields["storeUrl"].GetString());
        Assert.Equal("CC0", fields["license"].GetString());
        Assert.False(fields["attributionRequired"].GetBoolean());
        Assert.True(fields.ContainsKey("styles"));
        Assert.True(fields.ContainsKey("themes"));
    }
}

