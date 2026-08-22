namespace Application.Metadata;

/// <summary>
/// The asset metadata schema, v1 (prompt 16-A): one versioned declaration of every field
/// an asset can carry, per family.
///
/// <para>
/// It exists because Modelibr's metadata was a per-family accident - <c>Model</c> had a
/// description and tags, <c>Sound</c> and <c>Sprite</c> had neither, and no family had a
/// licence, an author or a record of where it came from, even though the store manifest
/// already sends all three on every import. Nothing anywhere stated what the complete field
/// set was, so a population pass over an existing library had no contract to write against
/// and an agent had <c>set_tags</c> and nothing else.
/// </para>
///
/// <para>
/// Every field names <b>where it is stored</b> (<see cref="AssetMetadataStorage"/>) as well
/// as what it is. That is the part that earns its keep: <c>Model</c>'s description lives on
/// the entity and <c>Sound</c>'s lives in the side table, and both are one field in one
/// contract, so a field can move homes later without the contract changing.
/// </para>
///
/// <para>
/// Categories are deliberately <b>not</b> inlined as enum values. They are a
/// <c>categoryRef</c> per family pointing at that family's category tree, which is
/// user-editable and is already the naming contract with the store (imports find-or-create
/// a category BY NAME within the item's asset type).
/// </para>
/// </summary>
public static class AssetMetadataSchema
{
    /// <summary>
    /// Bumped when a field is added, removed, or changes meaning. Stamped onto every
    /// <c>AssetMetadata</c> row so a later population pass can tell which rows predate a
    /// field rather than reading "empty" as "checked and there is nothing".
    /// </summary>
    public const int Version = 1;

    public static class Families
    {
        public const string Model = "Model";
        public const string TextureSet = "TextureSet";
        public const string Sprite = "Sprite";
        public const string Sound = "Sound";
        public const string Material = "Material";
        public const string EnvironmentMap = "EnvironmentMap";

        public static readonly IReadOnlyList<string> All = new[]
        {
            Model, TextureSet, Sprite, Sound, Material, EnvironmentMap
        };
    }

    public static class Groups
    {
        public const string Identity = "identity";
        public const string Classification = "classification";
        public const string Descriptive = "descriptive";
        public const string Rights = "rights";
        public const string Provenance = "provenance";
        public const string Technical = "technical";
    }

    /// <summary>Who put the value there - not who may change it.</summary>
    public static class FieldProvenance
    {
        /// <summary>A person or an agent said so.</summary>
        public const string Authored = "authored";

        /// <summary>Measured from the asset's own bytes by the extraction pipeline.</summary>
        public const string Derived = "derived";

        /// <summary>Carried in from the source the asset was imported from.</summary>
        public const string Imported = "imported";
    }

    /// <summary>Where the value physically lives, which is what the read/write surface resolves.</summary>
    public static class AssetMetadataStorage
    {
        /// <summary>A column or navigation on the family's own entity.</summary>
        public const string Entity = "entity";

        /// <summary>A column on the shared <c>AssetMetadata</c> side table.</summary>
        public const string Metadata = "metadata";

        /// <summary>A key in the side table's <c>facets</c> jsonb bag.</summary>
        public const string Facets = "facets";

        /// <summary>The derived layer (extraction / search projection). Read-only here.</summary>
        public const string Derived = "derived";
    }

    public static class FieldTypes
    {
        public const string Text = "text";
        public const string MultilineText = "multiline";
        public const string Enum = "enum";
        public const string Url = "url";
        public const string Integer = "integer";
        public const string Number = "number";
        public const string Boolean = "boolean";
        public const string Date = "date";
        public const string CategoryRef = "categoryRef";
    }

    // ---- controlled vocabularies -------------------------------------------------------

    /// <summary>
    /// How an asset looks. A typed facet rather than a tag, because prompt 13's project
    /// profile has to be able to <b>filter</b> on it: a project that says "Low Poly" can
    /// only bias search if "Low Poly" is a value of something, and as a free tag it is
    /// indistinguishable from <c>low_poly_v2_final</c>.
    /// </summary>
    public static readonly IReadOnlyList<string> Styles = new[]
    {
        "Realistic", "Stylized", "Low Poly", "Voxel", "Pixel Art", "Hand Painted",
        "Toon", "Photogrammetry", "Retro", "Minimalist", "Abstract"
    };

    /// <summary>What world the asset belongs to. Same reasoning as <see cref="Styles"/>.</summary>
    public static readonly IReadOnlyList<string> Themes = new[]
    {
        "Modern", "Medieval", "Fantasy", "Sci-Fi", "Post-Apocalyptic", "Historical",
        "Horror", "Cartoon", "Nature", "Industrial", "Military", "Urban", "Rural",
        "Space", "Underwater", "Western", "Cyberpunk", "Steampunk"
    };

    /// <summary>
    /// Recognized licences. The store's <c>license</c> is free text, so <c>CC0</c>,
    /// <c>cc0</c> and <c>CC0 1.0</c> arrive as three licences; what is recognized maps to a
    /// value here and the raw string is kept in <c>licenseName</c> regardless, so nothing
    /// an import carried is ever lost to an unrecognized spelling.
    /// </summary>
    public static readonly IReadOnlyList<string> Licenses = new[]
    {
        "CC0", "CC-BY", "CC-BY-SA", "CC-BY-NC", "CC-BY-ND", "MIT", "Apache-2.0",
        "GPL-3.0", "Royalty-Free", "Proprietary", "Custom", "Unknown"
    };

    /// <summary>Where an asset came from. Answers "may I redistribute this" before the licence does.</summary>
    public static readonly IReadOnlyList<string> SourceKinds = new[]
    {
        "Local Upload", "Store Import", "External URL", "Derived", "Generated"
    };

    // ---- the declaration ---------------------------------------------------------------

    private static readonly IReadOnlyDictionary<string, IReadOnlyList<AssetMetadataField>> FieldsByFamily =
        BuildFields();

    /// <summary>Every field the named family can carry, in display order. Empty for an unknown family.</summary>
    public static IReadOnlyList<AssetMetadataField> ForFamily(string family)
        => FieldsByFamily.TryGetValue(family, out var fields) ? fields : Array.Empty<AssetMetadataField>();

    public static bool IsKnownFamily(string family) => FieldsByFamily.ContainsKey(family);

    /// <summary>
    /// Resolves a family name case-insensitively to its canonical spelling, so a caller
    /// passing <c>"model"</c> is not told the family does not exist.
    /// </summary>
    public static string? NormalizeFamily(string? family)
    {
        if (string.IsNullOrWhiteSpace(family)) return null;
        var trimmed = family.Trim();
        return Families.All.FirstOrDefault(f => string.Equals(f, trimmed, StringComparison.OrdinalIgnoreCase));
    }

    public static AssetMetadataField? Field(string family, string key)
        => ForFamily(family).FirstOrDefault(f => string.Equals(f.Key, key, StringComparison.OrdinalIgnoreCase));

    private static IReadOnlyDictionary<string, IReadOnlyList<AssetMetadataField>> BuildFields()
    {
        var result = new Dictionary<string, IReadOnlyList<AssetMetadataField>>(StringComparer.Ordinal);
        foreach (var family in Families.All)
        {
            var fields = new List<AssetMetadataField>();
            fields.AddRange(Identity(family));
            fields.AddRange(Classification(family));
            fields.AddRange(Descriptive());
            fields.AddRange(Rights());
            fields.AddRange(Provenance());
            fields.AddRange(Technical(family));
            result[family] = fields;
        }

        return result;
    }

    /// <summary>
    /// Families whose entity already has a <c>Description</c> column. The rest keep theirs in
    /// the side table until part D gives them one - the schema states which, so the surface
    /// does not have to guess and a reader is not misled.
    /// </summary>
    private static bool DescriptionOnEntity(string family)
        => family is Families.Model or Families.Material;

    /// <summary>
    /// Families already wired to the shared <c>ModelTag</c> pool. <c>Sound</c> and
    /// <c>Sprite</c> are not, so their tags live in the side table until part D.
    /// </summary>
    private static bool TagsOnEntity(string family)
        => family is Families.Model or Families.TextureSet or Families.Material or Families.EnvironmentMap;

    private static IEnumerable<AssetMetadataField> Identity(string family)
    {
        yield return new AssetMetadataField(
            Key: "name",
            Label: "Name",
            Group: Groups.Identity,
            Type: FieldTypes.Text,
            Provenance: FieldProvenance.Authored,
            Storage: AssetMetadataStorage.Entity,
            ReadOnly: true,
            Description: "The asset's display name. Renaming is the asset's own command, not a metadata write.",
            StoreManifestPath: "items[].name");

        yield return new AssetMetadataField(
            Key: "description",
            Label: "Description",
            Group: Groups.Identity,
            Type: FieldTypes.MultilineText,
            Provenance: FieldProvenance.Authored,
            Storage: DescriptionOnEntity(family) ? AssetMetadataStorage.Entity : AssetMetadataStorage.Metadata,
            Description: "Prose about the asset. Matched by search in the prose tier.",
            StoreManifestPath: "description");
    }

    private static IEnumerable<AssetMetadataField> Classification(string family)
    {
        yield return new AssetMetadataField(
            Key: "category",
            Label: "Category",
            Group: Groups.Classification,
            Type: FieldTypes.CategoryRef,
            Provenance: FieldProvenance.Authored,
            Storage: AssetMetadataStorage.Entity,
            Description: "The asset's category, from this family's own tree. Category says WHAT the asset is; style and theme are separate facets.",
            CategoryFamily: family,
            StoreManifestPath: "items[].metadataJson.category");

        yield return new AssetMetadataField(
            Key: "tags",
            Label: "Tags",
            Group: Groups.Classification,
            Type: FieldTypes.Text,
            Repeats: true,
            Provenance: FieldProvenance.Authored,
            Storage: TagsOnEntity(family) ? AssetMetadataStorage.Entity : AssetMetadataStorage.Metadata,
            Description: "Free-text labels. The strongest search signal there is, because a person chose the words.",
            StoreManifestPath: "tags");
    }

    private static IEnumerable<AssetMetadataField> Descriptive()
    {
        yield return new AssetMetadataField(
            Key: "styles",
            Label: "Style",
            Group: Groups.Descriptive,
            Type: FieldTypes.Enum,
            Repeats: true,
            Provenance: FieldProvenance.Authored,
            Storage: AssetMetadataStorage.Metadata,
            Description: "How the asset looks. Typed rather than tagged so a project profile can filter on it.",
            AllowedValues: Styles);

        yield return new AssetMetadataField(
            Key: "themes",
            Label: "Theme",
            Group: Groups.Descriptive,
            Type: FieldTypes.Enum,
            Repeats: true,
            Provenance: FieldProvenance.Authored,
            Storage: AssetMetadataStorage.Metadata,
            Description: "What world the asset belongs to.",
            AllowedValues: Themes);
    }

    private static IEnumerable<AssetMetadataField> Rights()
    {
        yield return new AssetMetadataField(
            Key: "license",
            Label: "Licence",
            Group: Groups.Rights,
            Type: FieldTypes.Enum,
            Provenance: FieldProvenance.Imported,
            Storage: AssetMetadataStorage.Metadata,
            Description: "The recognized licence. Unrecognized spellings land as Custom with the original text in licenseName.",
            AllowedValues: Licenses,
            StoreManifestPath: "license");

        yield return new AssetMetadataField(
            Key: "licenseName",
            Label: "Licence (as stated)",
            Group: Groups.Rights,
            Type: FieldTypes.Text,
            Provenance: FieldProvenance.Imported,
            Storage: AssetMetadataStorage.Metadata,
            Description: "The licence exactly as the source stated it, kept verbatim so nothing is lost to a spelling this schema does not recognize.",
            StoreManifestPath: "license");

        yield return new AssetMetadataField(
            Key: "licenseUrl",
            Label: "Licence URL",
            Group: Groups.Rights,
            Type: FieldTypes.Url,
            Provenance: FieldProvenance.Imported,
            Storage: AssetMetadataStorage.Metadata,
            Description: "Where the licence text lives.");

        yield return new AssetMetadataField(
            Key: "author",
            Label: "Author",
            Group: Groups.Rights,
            Type: FieldTypes.Text,
            Provenance: FieldProvenance.Imported,
            Storage: AssetMetadataStorage.Metadata,
            Description: "Who made the asset.",
            StoreManifestPath: "author");

        yield return new AssetMetadataField(
            Key: "creditName",
            Label: "Credit as",
            Group: Groups.Rights,
            Type: FieldTypes.Text,
            Provenance: FieldProvenance.Imported,
            Storage: AssetMetadataStorage.Metadata,
            Description: "The name attribution must use, which is not always the author's name.",
            StoreManifestPath: "creditName");

        yield return new AssetMetadataField(
            Key: "creditUrl",
            Label: "Credit link",
            Group: Groups.Rights,
            Type: FieldTypes.Url,
            Provenance: FieldProvenance.Imported,
            Storage: AssetMetadataStorage.Metadata,
            Description: "The link attribution must point at.",
            StoreManifestPath: "creditUrl");

        yield return new AssetMetadataField(
            Key: "attributionRequired",
            Label: "Attribution required",
            Group: Groups.Rights,
            Type: FieldTypes.Boolean,
            Provenance: FieldProvenance.Imported,
            Storage: AssetMetadataStorage.Metadata,
            Description: "Whether shipping this asset obliges a credit. Defaulted from the licence on import and overridable, because the licence is not always the whole agreement.");
    }

    private static IEnumerable<AssetMetadataField> Provenance()
    {
        yield return new AssetMetadataField(
            Key: "sourceKind",
            Label: "Source",
            Group: Groups.Provenance,
            Type: FieldTypes.Enum,
            Provenance: FieldProvenance.Imported,
            Storage: AssetMetadataStorage.Metadata,
            Description: "Where the asset came from.",
            AllowedValues: SourceKinds);

        yield return new AssetMetadataField(
            Key: "sourceUrl",
            Label: "Source URL",
            Group: Groups.Provenance,
            Type: FieldTypes.Url,
            Provenance: FieldProvenance.Imported,
            Storage: AssetMetadataStorage.Metadata,
            Description: "The page the asset was obtained from.");

        yield return new AssetMetadataField(
            Key: "storeUrl",
            Label: "Store",
            Group: Groups.Provenance,
            Type: FieldTypes.Url,
            Provenance: FieldProvenance.Imported,
            Storage: AssetMetadataStorage.Metadata,
            Description: "The store instance this asset was imported from.");

        yield return new AssetMetadataField(
            Key: "storeAssetId",
            Label: "Store asset id",
            Group: Groups.Provenance,
            Type: FieldTypes.Text,
            Provenance: FieldProvenance.Imported,
            Storage: AssetMetadataStorage.Metadata,
            Description: "The store listing this asset came from.",
            StoreManifestPath: "assetId");

        yield return new AssetMetadataField(
            Key: "storeItemId",
            Label: "Store item id",
            Group: Groups.Provenance,
            Type: FieldTypes.Text,
            Provenance: FieldProvenance.Imported,
            Storage: AssetMetadataStorage.Metadata,
            Description: "The specific pack item this asset came from. What a later population pass keys on, and what prompt 08's dedupe needs.",
            StoreManifestPath: "items[].id");

        yield return new AssetMetadataField(
            Key: "importedAt",
            Label: "Imported",
            Group: Groups.Provenance,
            Type: FieldTypes.Date,
            Provenance: FieldProvenance.Imported,
            Storage: AssetMetadataStorage.Metadata,
            ReadOnly: true,
            Description: "When the import ran.");
    }

    /// <summary>
    /// The derived layer, declared read-only so a caller can see what is already measured
    /// rather than authoring a second, disagreeing copy of it. Only fields the pipeline
    /// genuinely produces are listed - a schema that promised measurements nobody takes
    /// would be worse than one that stayed quiet.
    /// </summary>
    private static IEnumerable<AssetMetadataField> Technical(string family)
    {
        switch (family)
        {
            case Families.Model:
                yield return Derived("triangleCount", "Triangles", FieldTypes.Integer);
                yield return Derived("vertexCount", "Vertices", FieldTypes.Integer);
                yield return Derived("materialCount", "Materials", FieldTypes.Integer);
                yield return Derived("partCount", "Parts", FieldTypes.Integer);
                yield return Derived("animationCount", "Animations", FieldTypes.Integer);
                yield return Derived("boneCount", "Bones", FieldTypes.Integer);
                yield return Derived("hasAnimations", "Animated", FieldTypes.Boolean);
                yield return Derived("hasUvs", "Has UVs", FieldTypes.Boolean);
                yield return Derived("uvStatus", "UV layout", FieldTypes.Text,
                    "unwrapped / atlas_packed / tiled / partial / no_uvs. Answers whether the asset can be baked onto, which hasUvs does not.");
                yield return Derived("dimensionX", "Width (m)", FieldTypes.Number);
                yield return Derived("dimensionY", "Height (m)", FieldTypes.Number);
                yield return Derived("dimensionZ", "Depth (m)", FieldTypes.Number);
                yield return Derived("maxDimension", "Largest axis (m)", FieldTypes.Number);
                yield return Derived("scaleConvention", "Scale trust", FieldTypes.Text,
                    "authored or normalized - whether the metres above are real-world size or a preview scaling.");
                yield return Derived("geometryKey", "Geometry fingerprint", FieldTypes.Text,
                    "Two assets carrying the same key are the same meshes under two ids.");
                break;

            case Families.TextureSet:
                yield return Derived("tileability", "Tileability", FieldTypes.Number);
                break;

            case Families.Sound:
                yield return Derived("durationClass", "Length", FieldTypes.Text);
                break;

            case Families.Sprite:
                // Imported, not derived: nothing in Modelibr measures a spritesheet's frame
                // grid. The store's item metadata carries it when the pack was built with
                // the frame annotations, and the importer copies what is there - so these
                // are populated for some sprites and absent for others, honestly.
                yield return ImportedFacet("frameWidth", "Frame width (px)", FieldTypes.Integer,
                    "items[].metadataJson.spritesheet.frameWidth");
                yield return ImportedFacet("frameHeight", "Frame height (px)", FieldTypes.Integer,
                    "items[].metadataJson.spritesheet.frameHeight");
                yield return ImportedFacet("frameCount", "Frames", FieldTypes.Integer,
                    "items[].metadataJson.spritesheet.frameCount");
                yield return ImportedFacet("fps", "Playback FPS", FieldTypes.Integer,
                    "items[].metadataJson.spritesheet.fps");
                yield return ImportedFacet("spritesheetType", "Sheet kind", FieldTypes.Text,
                    "items[].metadataJson.spritesheet.type");
                break;
        }
    }

    private static AssetMetadataField Derived(string key, string label, string type, string? description = null)
        => new(
            Key: key,
            Label: label,
            Group: Groups.Technical,
            Type: type,
            Provenance: FieldProvenance.Derived,
            Storage: AssetMetadataStorage.Derived,
            ReadOnly: true,
            Description: description);

    private static AssetMetadataField ImportedFacet(string key, string label, string type, string manifestPath)
        => new(
            Key: key,
            Label: label,
            Group: Groups.Technical,
            Type: type,
            Provenance: FieldProvenance.Imported,
            Storage: AssetMetadataStorage.Facets,
            StoreManifestPath: manifestPath);
}

/// <summary>One field of the asset metadata schema. Serialized as-is by the schema endpoint.</summary>
/// <param name="Repeats">True when the field holds a list of values rather than one.</param>
/// <param name="ReadOnly">True when <c>set_asset_metadata</c> refuses to write it.</param>
/// <param name="AllowedValues">The value set for an enum field; null for everything else.</param>
/// <param name="CategoryFamily">Which category tree a <c>categoryRef</c> points at.</param>
/// <param name="StoreManifestPath">
/// The store manifest path that populates this field, so a population pass has the mapping
/// in the contract rather than in someone's head. Null when nothing in a manifest fills it.
/// </param>
public sealed record AssetMetadataField(
    string Key,
    string Label,
    string Group,
    string Type,
    string Provenance,
    string Storage,
    bool Repeats = false,
    bool ReadOnly = false,
    string? Description = null,
    IReadOnlyList<string>? AllowedValues = null,
    string? CategoryFamily = null,
    string? StoreManifestPath = null);
