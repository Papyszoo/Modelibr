namespace Application.Metadata;

/// <summary>The schema as served to a caller: every family, every field.</summary>
public sealed record AssetMetadataSchemaResponse(
    int SchemaVersion,
    IReadOnlyList<AssetMetadataFamilySchema> Families);

public sealed record AssetMetadataFamilySchema(
    string AssetType,
    IReadOnlyList<AssetMetadataField> Fields);

/// <summary>
/// One field's current value on one asset.
/// </summary>
/// <param name="Value">
/// The value, or null when the field is empty. Typed as <see cref="object"/> so a repeating
/// field serializes as an array and a scalar as a scalar, rather than every value arriving
/// as a string the caller has to parse back.
/// </param>
public sealed record AssetMetadataValue(
    string Key,
    string Group,
    string Type,
    bool Repeats,
    bool ReadOnly,
    string Provenance,
    string Storage,
    object? Value);

/// <summary>
/// What is still missing, over the fields a caller could actually fill - read-only and
/// derived fields are excluded, because "incomplete" must mean "someone can do something
/// about it".
/// </summary>
/// <remarks>
/// This is the field a population pass drives off: it asks which assets are incomplete and
/// what they are missing, rather than re-deriving that question from a full read of every
/// asset in the library.
/// </remarks>
public sealed record AssetMetadataCompleteness(
    int FillableFieldCount,
    int FilledFieldCount,
    IReadOnlyList<string> MissingKeys);

/// <param name="SchemaVersion">The version the stored row was last written under; 0 when the asset has no row yet.</param>
/// <param name="CurrentSchemaVersion">The version of the schema this response was built from.</param>
public sealed record AssetMetadataResponse(
    string AssetType,
    int AssetId,
    string Name,
    int SchemaVersion,
    int CurrentSchemaVersion,
    IReadOnlyList<AssetMetadataValue> Fields,
    AssetMetadataCompleteness Completeness);
