using System.Text.Json;
using Application.Metadata;

namespace Application.StoreImports;

/// <summary>
/// Turns what an import knows about an asset's rights, origin and descriptive facets into a
/// metadata patch (prompt 16-E, extended for the store's top-level descriptive fields).
///
/// <para>
/// The policy lives here, as a pure function, because it is the part with a rule worth
/// stating rather than plumbing: <b>rights and descriptive fields are gap-fill</b> - a
/// licence, credit, description, style or theme already on the asset is never overwritten,
/// matching the category gap-fill the importer has always done - while <b>provenance is
/// always re-stamped</b>, because where an asset came from is a fact about the import rather
/// than an opinion someone can hold a better version of. Tags are the one additive field:
/// the store's tags are merged onto whatever the asset already carries.
/// </para>
/// </summary>
public static class StoreMetadataStampFields
{
    /// <summary>What the asset currently says, so gap-fill can tell "empty" from "authored".</summary>
    public sealed record Current(
        string? Name,
        string? Description,
        IReadOnlyList<string> Tags,
        IReadOnlyList<string> Styles,
        IReadOnlyList<string> Themes);

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

        AddFacets(assetType, stamp.FacetsJson, filled, fields);

        return fields;

        void GapFill(string key, object? value)
        {
            if (value is null || filled.Contains(key)) return;
            Set(key, value);
        }

        void Set(string key, object value)
        {
            // The command refuses a patch that carries a read-only field, so emitting one
            // would write NOTHING at all rather than everything-but-that-field. Only the
            // writable schema fields belong in a stamp: importedAt and sourceFolder are
            // read-only (the import time is recorded on the pack and the provenance row),
            // and the derived measurements are the extraction pipeline's to fill.
            var field = AssetMetadataSchema.Field(assetType, key);
            if (field is null || field.ReadOnly || field.Storage == AssetMetadataSchema.AssetMetadataStorage.Derived)
                return;

            fields[key] = JsonSerializer.SerializeToElement(value);
        }
    }

    /// <summary>
    /// The descriptive fields the manifest now sends, as a gap-fill over what the asset
    /// already carries.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Description lands only when the asset has none, or when it still merely repeats the
    /// name the import itself gave it - a person's prose is never overwritten. Tags are
    /// additive: the store's are merged onto the existing set case-insensitively, and the
    /// field is written only when at least one is genuinely new. Styles and themes land only
    /// when the asset has none, so a curator's edit stands.
    /// </para>
    /// <para>
    /// <paramref name="stamp"/>'s styles and themes are expected to have been filtered
    /// against the schema vocabulary by the caller (see <see cref="FilterEnum"/>), so only
    /// values the metadata command will accept reach the patch.
    /// </para>
    /// </remarks>
    public static IReadOnlyDictionary<string, JsonElement> BuildDescriptive(
        StoreAssetMetadataStamp stamp, Current current)
    {
        var fields = new Dictionary<string, JsonElement>(StringComparer.Ordinal);

        // Description and tags share their gap-fill rule with the annotate_asset tool, so the
        // rule lives once in GapFillDescriptiveMetadata and both callers write the same way.
        var (description, tags) = GapFillDescriptiveMetadata(
            current.Name, current.Description, current.Tags, stamp.Description, stamp.Tags);

        if (description is not null)
        {
            fields["description"] = JsonSerializer.SerializeToElement(description);
        }

        if (tags is not null)
        {
            fields["tags"] = JsonSerializer.SerializeToElement(tags);
        }

        if (current.Styles.Count == 0 && stamp.Styles is { Count: > 0 })
        {
            fields["styles"] = JsonSerializer.SerializeToElement(stamp.Styles);
        }

        if (current.Themes.Count == 0 && stamp.Themes is { Count: > 0 })
        {
            fields["themes"] = JsonSerializer.SerializeToElement(stamp.Themes);
        }

        return fields;
    }

    /// <summary>
    /// The gap-fill rule for the two descriptive fields an agent may also fill: a description
    /// lands only where the asset has none of its own, and tags are merged additively.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Extracted from <see cref="BuildDescriptive"/> so the store import and the agent's
    /// <c>annotate_asset</c> tool cannot drift: both call this and get the same answer to
    /// "may I write this?".
    /// </para>
    /// <para>
    /// A description lands only when the asset has none, or when it still merely repeats the
    /// name - the placeholder every created asset starts with - so a person's prose is never
    /// overwritten. Tags are additive: the new ones are merged onto the existing set
    /// case-insensitively, the asset's own spelling winning for a tag it already carries, and
    /// only genuinely new tags are written.
    /// </para>
    /// </remarks>
    /// <param name="currentName">The asset's name, so a description that only repeats it is
    /// recognized as un-authored rather than protected.</param>
    /// <param name="currentDescription">The asset's description as it stands.</param>
    /// <param name="currentTags">The tags the asset already carries.</param>
    /// <param name="description">The description the caller wants to record, or null.</param>
    /// <param name="tags">The tags the caller wants to add, or null.</param>
    /// <returns>
    /// The description to write (null when the asset's own stands) and the merged tag list to
    /// write (null when nothing genuinely new would be added), so two nulls mean "no change".
    /// </returns>
    public static (string? Description, IReadOnlyList<string>? Tags) GapFillDescriptiveMetadata(
        string? currentName,
        string? currentDescription,
        IReadOnlyList<string> currentTags,
        string? description,
        IReadOnlyList<string>? tags)
    {
        // Description: only when there is nothing of the asset's own to protect. The
        // "equals its name" arm is what lets a first import replace the placeholder
        // description every created asset starts with.
        var candidate = description?.Trim();
        var existing = currentDescription?.Trim();
        var hasOwnDescription =
            !string.IsNullOrWhiteSpace(existing) &&
            !string.Equals(existing, currentName?.Trim(), StringComparison.Ordinal);

        string? descriptionToWrite =
            !string.IsNullOrWhiteSpace(candidate) && !hasOwnDescription ? candidate : null;

        // Tags: additive merge, case-insensitive, preserving the asset's existing spelling.
        IReadOnlyList<string>? tagsToWrite = null;
        if (tags is { Count: > 0 })
        {
            var merged = new List<string>(currentTags);
            var seen = new HashSet<string>(currentTags, StringComparer.OrdinalIgnoreCase);
            foreach (var tag in tags)
            {
                if (string.IsNullOrWhiteSpace(tag)) continue;
                var trimmed = tag.Trim();
                if (seen.Add(trimmed)) merged.Add(trimmed);
            }

            if (merged.Count > currentTags.Count)
            {
                tagsToWrite = merged;
            }
        }

        return (descriptionToWrite, tagsToWrite);
    }

    /// <summary>
    /// Keeps only the values the given schema vocabulary knows, canonicalized to its
    /// spelling; the ones it does not are returned so the caller can log them.
    /// </summary>
    /// <remarks>
    /// Dropping rather than failing is deliberate: the manifest is the store's, and one
    /// stray facet must not sink an otherwise good import. Canonicalizing before the write
    /// is also what keeps the facet filterable - the command would reject "lowpoly", but
    /// accepting it verbatim would make it a value nothing else shares.
    /// </remarks>
    public static (IReadOnlyList<string> Accepted, IReadOnlyList<string> Dropped) FilterEnum(
        IReadOnlyList<string>? values,
        IReadOnlyList<string> vocabulary)
    {
        var accepted = new List<string>();
        var dropped = new List<string>();
        if (values is null) return (accepted, dropped);

        foreach (var value in values)
        {
            if (string.IsNullOrWhiteSpace(value)) continue;

            var trimmed = value.Trim();
            var match = vocabulary.FirstOrDefault(
                v => string.Equals(v, trimmed, StringComparison.OrdinalIgnoreCase));

            if (match is null)
                dropped.Add(trimmed);
            else if (!accepted.Contains(match, StringComparer.Ordinal))
                accepted.Add(match);
        }

        return (accepted, dropped);
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
