using System.Text.Json;
using Application.Metadata;

namespace Application.StoreImports;

/// <summary>
/// Turns what an import knows about an asset's rights and origin into a metadata patch
/// (prompt 16-E).
///
/// <para>
/// The policy lives here, as a pure function, because it is the part with a rule worth
/// stating rather than plumbing: <b>rights are gap-fill</b> - a licence or credit already on
/// the asset is never overwritten, matching the category gap-fill the importer has always
/// done - while <b>provenance is always re-stamped</b>, because where an asset came from is a
/// fact about the import rather than an opinion someone can hold a better version of.
/// </para>
/// </summary>
public static class StoreMetadataStampFields
{
    public static IReadOnlyDictionary<string, JsonElement> Build(
        string assetType,
        StoreAssetMetadataStamp stamp,
        IEnumerable<string> alreadyFilledKeys)
    {
        var filled = new HashSet<string>(alreadyFilledKeys, StringComparer.Ordinal);
        var fields = new Dictionary<string, JsonElement>(StringComparer.Ordinal);

        GapFill("license", stamp.License);
        GapFill("licenseName", stamp.LicenseName);
        GapFill("author", stamp.Author);
        GapFill("creditName", stamp.CreditName);
        GapFill("creditUrl", stamp.CreditUrl);
        GapFill("attributionRequired", stamp.AttributionRequired);
        GapFill("sourceUrl", stamp.SourceUrl);

        Set("sourceKind", "Store Import");
        Set("storeUrl", stamp.StoreUrl);
        Set("storeAssetId", stamp.StoreAssetId);
        if (!string.IsNullOrWhiteSpace(stamp.StoreItemId))
        {
            Set("storeItemId", stamp.StoreItemId);
        }
        Set("importedAt", stamp.ImportedAt.ToString("O"));

        AddFacets(assetType, stamp.FacetsJson, filled, fields);

        return fields;

        void GapFill(string key, object? value)
        {
            if (value is null || filled.Contains(key)) return;
            Set(key, value);
        }

        void Set(string key, object value) => fields[key] = JsonSerializer.SerializeToElement(value);
    }

    private static void AddFacets(
        string assetType,
        string? facetsJson,
        HashSet<string> filled,
        Dictionary<string, JsonElement> fields)
    {
        if (string.IsNullOrWhiteSpace(facetsJson)) return;

        try
        {
            using var document = JsonDocument.Parse(facetsJson);
            if (document.RootElement.ValueKind != JsonValueKind.Object) return;

            foreach (var property in document.RootElement.EnumerateObject())
            {
                // Only keys the family's schema declares. The store's item metadata is a
                // free-form bag, and copying it wholesale would fill the facets column with
                // whatever that store happened to put there.
                if (AssetMetadataSchema.Field(assetType, property.Name) is null) continue;
                if (filled.Contains(property.Name)) continue;

                fields[property.Name] = property.Value.Clone();
            }
        }
        catch (JsonException)
        {
            // Unparseable item metadata is the store's problem, not this import's.
        }
    }
}
