using System.Text.Json;
using Application.Metadata;
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
        Assert.False(fields.ContainsKey("storeItemId"));
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
            "Model", Stamp(), new[] { "storeUrl", "storeAssetId", "sourceKind", "importedAt" });

        Assert.Equal("https://store.example", Text(fields, "storeUrl"));
        Assert.Equal("abc", Text(fields, "storeAssetId"));
        Assert.False(fields.ContainsKey("storeItemId"));
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

    /// <summary>
    /// The regression behind 330 store models importing with no <c>AssetMetadata</c> row:
    /// the patch carried <c>importedAt</c>, the schema declares it read-only, and the command
    /// refuses an entire patch that contains a read-only field. A stamp may only ever carry
    /// writable fields.
    /// </summary>
    [Fact]
    public void Build_NeverCarriesAFieldTheCommandWillRefuse()
    {
        var fields = StoreMetadataStampFields.Build("Model", Stamp(), Array.Empty<string>());

        Assert.DoesNotContain("importedAt", fields.Keys);

        foreach (var key in fields.Keys)
        {
            var field = AssetMetadataSchema.Field("Model", key);
            Assert.NotNull(field);
            Assert.False(field!.ReadOnly, $"'{key}' is read-only, so a patch carrying it would write nothing.");
            Assert.NotEqual(
                AssetMetadataSchema.AssetMetadataStorage.Derived, field.Storage);
        }
    }

    [Fact]
    public void Description_TheAssetHasItsOwn_IsNotOverwritten()
    {
        var fields = StoreMetadataStampFields.BuildDescriptive(
            DescriptiveStamp(description: "Store prose"),
            Current(description: "Words a person wrote"));

        Assert.False(fields.ContainsKey("description"));
    }

    [Fact]
    public void Description_ThatStillRepeatsTheName_IsReplaced()
    {
        // Every created asset starts with its name as the description; that placeholder is
        // exactly what the store's description is for.
        var fields = StoreMetadataStampFields.BuildDescriptive(
            DescriptiveStamp(description: "Arrow ranged weapon"),
            Current(name: "Arrow", description: "Arrow"));

        Assert.Equal("Arrow ranged weapon", Text(fields, "description"));
    }

    [Fact]
    public void Tags_AreMergedAdditively_CaseInsensitively()
    {
        var fields = StoreMetadataStampFields.BuildDescriptive(
            DescriptiveStamp(tags: new[] { "weapons", "LOW-POLY", "arrow" }),
            Current(tags: new[] { "furniture", "Weapons" }));

        var tags = fields["tags"].Deserialize<IReadOnlyList<string>>();
        // Existing spelling wins for a tag already present; genuinely new tags are appended.
        Assert.Equal(new[] { "furniture", "Weapons", "LOW-POLY", "arrow" }, tags);
    }

    [Fact]
    public void Tags_ThatAreAllAlreadyPresent_AreNotRewritten()
    {
        var fields = StoreMetadataStampFields.BuildDescriptive(
            DescriptiveStamp(tags: new[] { "weapons", "arrow" }),
            Current(tags: new[] { "Weapons", "arrow" }));

        Assert.False(fields.ContainsKey("tags"));
    }

    [Fact]
    public void GapFill_Description_AuthoredByTheAsset_IsKept()
    {
        var (description, tags) = StoreMetadataStampFields.GapFillDescriptiveMetadata(
            "Arrow", "Words a person wrote", Array.Empty<string>(), "Store prose", null);

        // A description of the asset's own is never overwritten, and there is nothing to add.
        Assert.Null(description);
        Assert.Null(tags);
    }

    [Fact]
    public void GapFill_Description_ThatIsEmpty_IsReplaced()
    {
        var (description, _) = StoreMetadataStampFields.GapFillDescriptiveMetadata(
            "Arrow", null, Array.Empty<string>(), "A wooden arrow", null);

        Assert.Equal("A wooden arrow", description);
    }

    [Fact]
    public void GapFill_Description_ThatStillRepeatsTheName_IsReplaced()
    {
        // Every created asset starts with its name as the description; that placeholder is
        // what a gap-fill is for.
        var (description, _) = StoreMetadataStampFields.GapFillDescriptiveMetadata(
            "Arrow", "Arrow", Array.Empty<string>(), "A wooden arrow", null);

        Assert.Equal("A wooden arrow", description);
    }

    [Fact]
    public void GapFill_WithNothingToWrite_ReturnsTwoNulls()
    {
        var (description, tags) = StoreMetadataStampFields.GapFillDescriptiveMetadata(
            "Arrow", "Authored prose", new[] { "Weapons" }, null, new[] { "weapons" });

        Assert.Null(description);
        Assert.Null(tags);
    }

    [Fact]
    public void GapFill_Tags_MergeAdditively_CaseInsensitively_WithoutDuplicates()
    {
        var (_, tags) = StoreMetadataStampFields.GapFillDescriptiveMetadata(
            "Arrow", null, new[] { "furniture", "Weapons" },
            null, new[] { "weapons", "LOW-POLY", "arrow", "  " });

        // Existing spelling wins for a tag already present; blank tags are ignored; genuinely
        // new tags are appended in the order the caller gave them.
        Assert.Equal(new[] { "furniture", "Weapons", "LOW-POLY", "arrow" }, tags);
    }

    [Fact]
    public void FilterEnum_DropsUnknownValuesAndKeepsTheSchemaSpelling()
    {
        var (accepted, dropped) = StoreMetadataStampFields.FilterEnum(
            new[] { "low poly", "voxel", "lowpoly" },
            AssetMetadataSchema.Styles);

        Assert.Equal(new[] { "Low Poly", "Voxel" }, accepted);
        Assert.Equal(new[] { "lowpoly" }, dropped);
    }

    [Fact]
    public void Styles_TheSchemaKnows_AreFilledOnlyWhenTheAssetHasNone()
    {
        var ontoEmpty = StoreMetadataStampFields.BuildDescriptive(
            DescriptiveStamp(styles: new[] { "Low Poly" }), Current());
        var ontoExisting = StoreMetadataStampFields.BuildDescriptive(
            DescriptiveStamp(styles: new[] { "Low Poly" }),
            Current(styles: new[] { "Realistic" }));

        Assert.Equal(new[] { "Low Poly" }, ontoEmpty["styles"].Deserialize<IReadOnlyList<string>>());
        Assert.False(ontoExisting.ContainsKey("styles"));
    }

    [Fact]
    public void Themes_TheSchemaKnows_AreFilledOnlyWhenTheAssetHasNone()
    {
        var ontoEmpty = StoreMetadataStampFields.BuildDescriptive(
            DescriptiveStamp(themes: new[] { "Medieval" }), Current());
        var ontoExisting = StoreMetadataStampFields.BuildDescriptive(
            DescriptiveStamp(themes: new[] { "Medieval" }),
            Current(themes: new[] { "Sci-Fi" }));

        Assert.Equal(new[] { "Medieval" }, ontoEmpty["themes"].Deserialize<IReadOnlyList<string>>());
        Assert.False(ontoExisting.ContainsKey("themes"));
    }

    private static StoreAssetMetadataStamp DescriptiveStamp(
        string? description = "Arrow ranged weapon",
        IReadOnlyList<string>? tags = null,
        IReadOnlyList<string>? styles = null,
        IReadOnlyList<string>? themes = null)
        => Stamp() with
        {
            Description = description,
            Tags = tags,
            Styles = styles,
            Themes = themes,
        };

    private static StoreMetadataStampFields.Current Current(
        string? name = "Arrow",
        string? description = null,
        IReadOnlyList<string>? tags = null,
        IReadOnlyList<string>? styles = null,
        IReadOnlyList<string>? themes = null)
        => new(
            name,
            description,
            tags ?? Array.Empty<string>(),
            styles ?? Array.Empty<string>(),
            themes ?? Array.Empty<string>());
}
