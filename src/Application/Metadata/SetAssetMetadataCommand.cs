using System.Globalization;
using System.Text.Json;
using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Metadata;

/// <summary>
/// Writes schema fields onto one asset, routing each to wherever the schema says it lives.
///
/// <para>
/// A <b>patch, not a replace</b>: a key that is absent means "leave it", and a key whose value
/// is JSON <c>null</c> means "clear it". The distinction is the whole reason the payload is a
/// field bag rather than a DTO - a population pass that has learned an asset's licence must
/// not blank the description someone wrote, and with a DTO of nullable properties the two
/// intentions are indistinguishable.
/// </para>
/// </summary>
/// <param name="Fields">Schema field key → value. Values are validated against the schema.</param>
public sealed record SetAssetMetadataCommand(
    string AssetType,
    int AssetId,
    IReadOnlyDictionary<string, JsonElement> Fields)
    : ICommand<AssetMetadataResponse>;

internal sealed class SetAssetMetadataCommandHandler
    : ICommandHandler<SetAssetMetadataCommand, AssetMetadataResponse>
{
    private readonly IAssetEntityMetadata _entity;
    private readonly IAssetMetadataRepository _metadata;
    private readonly IQueryHandler<ReadAssetMetadataQuery, AssetMetadataResponse> _read;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public SetAssetMetadataCommandHandler(
        IAssetEntityMetadata entity,
        IAssetMetadataRepository metadata,
        IQueryHandler<ReadAssetMetadataQuery, AssetMetadataResponse> read,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _entity = entity;
        _metadata = metadata;
        _read = read;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<AssetMetadataResponse>> Handle(
        SetAssetMetadataCommand command, CancellationToken cancellationToken)
    {
        var family = AssetMetadataSchema.NormalizeFamily(command.AssetType);
        if (family is null)
        {
            return Result.Failure<AssetMetadataResponse>(new Error(
                "UnknownAssetFamily",
                $"'{command.AssetType}' is not an asset family this schema covers. Known: {string.Join(", ", AssetMetadataSchema.Families.All)}."));
        }

        var parsed = ParseFields(family, command.Fields);
        if (parsed.IsFailure)
        {
            return Result.Failure<AssetMetadataResponse>(parsed.Error);
        }

        var patch = parsed.Value;

        // The asset has to exist before anything is written - otherwise a typo'd id would
        // leave a metadata row describing nothing, and the unique index would then make the
        // real asset's first write collide with it.
        var entityState = await _entity.ReadAsync(family, command.AssetId, cancellationToken);
        if (entityState.IsFailure)
        {
            return Result.Failure<AssetMetadataResponse>(entityState.Error);
        }

        if (!patch.EntityWrite.IsEmpty)
        {
            var write = await _entity.WriteAsync(family, command.AssetId, patch.EntityWrite, cancellationToken);
            if (write.IsFailure)
            {
                return Result.Failure<AssetMetadataResponse>(write.Error);
            }
        }

        if (patch.TouchesSideTable)
        {
            await ApplySideTableAsync(family, command.AssetId, patch, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }

        return await _read.Handle(new ReadAssetMetadataQuery(family, command.AssetId), cancellationToken);
    }

    private async Task ApplySideTableAsync(
        string family, int assetId, MetadataPatch patch, CancellationToken cancellationToken)
    {
        var now = _dateTimeProvider.UtcNow;
        var stored = await _metadata.GetAsync(family, assetId, cancellationToken);
        var isNew = stored is null;
        stored ??= AssetMetadata.Create(family, assetId, AssetMetadataSchema.Version, now);

        stored.SetDescriptive(
            patch.Description.Or(stored.Description),
            patch.Tags.Or(stored.Tags.ToList()),
            patch.Styles.Or(stored.Styles.ToList()),
            patch.Themes.Or(stored.Themes.ToList()),
            now);

        stored.SetRights(
            patch.License.Or(stored.License),
            patch.LicenseName.Or(stored.LicenseName),
            patch.LicenseUrl.Or(stored.LicenseUrl),
            patch.Author.Or(stored.Author),
            patch.CreditName.Or(stored.CreditName),
            patch.CreditUrl.Or(stored.CreditUrl),
            patch.AttributionRequired.Or(stored.AttributionRequired),
            now);

        stored.SetProvenance(
            patch.SourceKind.Or(stored.SourceKind),
            patch.SourceUrl.Or(stored.SourceUrl),
            patch.StoreUrl.Or(stored.StoreUrl),
            patch.StoreAssetId.Or(stored.StoreAssetId),
            patch.StoreItemId.Or(stored.StoreItemId),
            patch.ImportedAt.Or(stored.ImportedAt),
            now);

        if (patch.Facets.Count > 0)
        {
            var merged = new Dictionary<string, JsonElement>(
                AssetMetadataFacets.Parse(stored.FacetsJson), StringComparer.Ordinal);
            foreach (var (key, value) in patch.Facets)
            {
                if (value.ValueKind == JsonValueKind.Null)
                {
                    merged.Remove(key);
                }
                else
                {
                    merged[key] = value;
                }
            }

            stored.SetFacets(AssetMetadataFacets.Serialize(merged), now);
        }

        stored.StampSchemaVersion(AssetMetadataSchema.Version, now);

        if (isNew)
        {
            await _metadata.AddAsync(stored, cancellationToken);
        }
        else
        {
            await _metadata.UpdateAsync(stored, cancellationToken);
        }
    }

    // ---- parsing + validation ----------------------------------------------------------

    private static Result<MetadataPatch> ParseFields(
        string family, IReadOnlyDictionary<string, JsonElement> fields)
    {
        var patch = new MetadataPatch();
        var entityDescription = Patch<string?>.Unset;
        var entityTags = Patch<IReadOnlyList<string>?>.Unset;
        var entityCategory = Patch<int?>.Unset;

        foreach (var (rawKey, rawValue) in fields)
        {
            var field = AssetMetadataSchema.Field(family, rawKey);
            if (field is null)
            {
                return Result.Failure<MetadataPatch>(new Error(
                    "UnknownMetadataField",
                    $"'{rawKey}' is not a field of the {family} metadata schema. Call get_metadata_schema for the field list."));
            }

            if (field.ReadOnly || field.Storage == AssetMetadataSchema.AssetMetadataStorage.Derived)
            {
                return Result.Failure<MetadataPatch>(new Error(
                    "ReadOnlyMetadataField",
                    $"'{field.Key}' is {(field.Storage == AssetMetadataSchema.AssetMetadataStorage.Derived ? "measured by the extraction pipeline" : "read-only")} and cannot be written here."));
            }

            var isNull = rawValue.ValueKind == JsonValueKind.Null;

            if (field.Storage == AssetMetadataSchema.AssetMetadataStorage.Facets)
            {
                patch.Facets[field.Key] = rawValue.Clone();
                continue;
            }

            if (field.Repeats)
            {
                var list = ReadList(field, rawValue);
                if (list.IsFailure) return Result.Failure<MetadataPatch>(list.Error);

                switch (field.Key)
                {
                    case "tags" when field.Storage == AssetMetadataSchema.AssetMetadataStorage.Entity:
                        entityTags = Patch<IReadOnlyList<string>?>.Set(list.Value);
                        break;
                    case "tags":
                        patch.Tags = Patch<IReadOnlyList<string>?>.Set(list.Value);
                        break;
                    case "styles":
                        patch.Styles = Patch<IReadOnlyList<string>?>.Set(list.Value);
                        break;
                    case "themes":
                        patch.Themes = Patch<IReadOnlyList<string>?>.Set(list.Value);
                        break;
                }

                continue;
            }

            switch (field.Key)
            {
                case "category":
                {
                    if (!isNull && rawValue.ValueKind != JsonValueKind.Number)
                    {
                        return Result.Failure<MetadataPatch>(TypeError(field, "a category id, or null to clear it"));
                    }

                    entityCategory = Patch<int?>.Set(isNull ? null : rawValue.GetInt32());
                    break;
                }

                case "description" when field.Storage == AssetMetadataSchema.AssetMetadataStorage.Entity:
                {
                    var text = ReadString(field, rawValue);
                    if (text.IsFailure) return Result.Failure<MetadataPatch>(text.Error);
                    entityDescription = Patch<string?>.Set(text.Value);
                    break;
                }

                case "attributionRequired":
                {
                    if (!isNull && rawValue.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
                    {
                        return Result.Failure<MetadataPatch>(TypeError(field, "true, false, or null"));
                    }

                    patch.AttributionRequired = Patch<bool?>.Set(isNull ? null : rawValue.GetBoolean());
                    break;
                }

                case "importedAt":
                {
                    if (!isNull && rawValue.ValueKind != JsonValueKind.String)
                    {
                        return Result.Failure<MetadataPatch>(TypeError(field, "an ISO-8601 timestamp, or null"));
                    }

                    if (isNull)
                    {
                        patch.ImportedAt = Patch<DateTime?>.Set(null);
                    }
                    else if (DateTime.TryParse(
                                 rawValue.GetString(), CultureInfo.InvariantCulture,
                                 DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var parsed))
                    {
                        patch.ImportedAt = Patch<DateTime?>.Set(parsed);
                    }
                    else
                    {
                        return Result.Failure<MetadataPatch>(TypeError(field, "an ISO-8601 timestamp, or null"));
                    }

                    break;
                }

                default:
                {
                    var text = ReadString(field, rawValue);
                    if (text.IsFailure) return Result.Failure<MetadataPatch>(text.Error);

                    switch (field.Key)
                    {
                        case "description": patch.Description = Patch<string?>.Set(text.Value); break;
                        case "license": patch.License = Patch<string?>.Set(text.Value); break;
                        case "licenseName": patch.LicenseName = Patch<string?>.Set(text.Value); break;
                        case "licenseUrl": patch.LicenseUrl = Patch<string?>.Set(text.Value); break;
                        case "author": patch.Author = Patch<string?>.Set(text.Value); break;
                        case "creditName": patch.CreditName = Patch<string?>.Set(text.Value); break;
                        case "creditUrl": patch.CreditUrl = Patch<string?>.Set(text.Value); break;
                        case "sourceKind": patch.SourceKind = Patch<string?>.Set(text.Value); break;
                        case "sourceUrl": patch.SourceUrl = Patch<string?>.Set(text.Value); break;
                        case "storeUrl": patch.StoreUrl = Patch<string?>.Set(text.Value); break;
                        case "storeAssetId": patch.StoreAssetId = Patch<string?>.Set(text.Value); break;
                        case "storeItemId": patch.StoreItemId = Patch<string?>.Set(text.Value); break;
                    }

                    break;
                }
            }
        }

        patch.EntityWrite = new AssetEntityMetadataWrite(
            SetDescription: entityDescription.IsSet,
            Description: entityDescription.Value,
            SetTags: entityTags.IsSet,
            Tags: entityTags.Value,
            SetCategory: entityCategory.IsSet,
            CategoryId: entityCategory.Value);

        return Result.Success(patch);
    }

    private static Result<string?> ReadString(AssetMetadataField field, JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Null)
        {
            return Result.Success<string?>(null);
        }

        if (value.ValueKind != JsonValueKind.String)
        {
            return Result.Failure<string?>(TypeError(field, "a string, or null to clear it"));
        }

        var text = value.GetString();
        if (string.IsNullOrWhiteSpace(text))
        {
            // An empty string is a clear, not a value: nothing downstream can tell the two
            // apart and storing "" would make the field read as filled while saying nothing.
            return Result.Success<string?>(null);
        }

        return NormalizeEnum(field, text.Trim());
    }

    private static Result<IReadOnlyList<string>?> ReadList(AssetMetadataField field, JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Null)
        {
            return Result.Success<IReadOnlyList<string>?>(Array.Empty<string>());
        }

        if (value.ValueKind != JsonValueKind.Array)
        {
            return Result.Failure<IReadOnlyList<string>?>(TypeError(field, "an array of strings, or null to clear it"));
        }

        var result = new List<string>();
        foreach (var item in value.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.String)
            {
                return Result.Failure<IReadOnlyList<string>?>(TypeError(field, "an array of strings"));
            }

            var text = item.GetString();
            if (string.IsNullOrWhiteSpace(text)) continue;

            var normalized = NormalizeEnum(field, text.Trim());
            if (normalized.IsFailure) return Result.Failure<IReadOnlyList<string>?>(normalized.Error);
            if (normalized.Value is not null) result.Add(normalized.Value);
        }

        return Result.Success<IReadOnlyList<string>?>(result);
    }

    /// <summary>
    /// Maps a value onto the schema's canonical spelling, case-insensitively, and refuses
    /// anything the vocabulary does not contain. Accepting "low poly" for "Low Poly" is what
    /// keeps the facet filterable; accepting "lowpoly" would quietly make it not.
    /// </summary>
    private static Result<string?> NormalizeEnum(AssetMetadataField field, string text)
    {
        if (field.AllowedValues is null || field.AllowedValues.Count == 0)
        {
            return Result.Success<string?>(text);
        }

        var match = field.AllowedValues.FirstOrDefault(
            v => string.Equals(v, text, StringComparison.OrdinalIgnoreCase));

        if (match is null)
        {
            return Result.Failure<string?>(new Error(
                "InvalidMetadataValue",
                $"'{text}' is not a value of '{field.Key}'. Allowed: {string.Join(", ", field.AllowedValues)}."));
        }

        return Result.Success<string?>(match);
    }

    private static Error TypeError(AssetMetadataField field, string expected)
        => new("InvalidMetadataValue", $"'{field.Key}' expects {expected}.");

    /// <summary>An optional value that can distinguish "not given" from "given as null".</summary>
    private readonly record struct Patch<T>(bool IsSet, T? Value)
    {
        public static Patch<T> Unset => default;
        public static Patch<T> Set(T? value) => new(true, value);

        public T? Or(T? current) => IsSet ? Value : current;
    }

    private sealed class MetadataPatch
    {
        public Patch<string?> Description;
        public Patch<IReadOnlyList<string>?> Tags;
        public Patch<IReadOnlyList<string>?> Styles;
        public Patch<IReadOnlyList<string>?> Themes;
        public Patch<string?> License;
        public Patch<string?> LicenseName;
        public Patch<string?> LicenseUrl;
        public Patch<string?> Author;
        public Patch<string?> CreditName;
        public Patch<string?> CreditUrl;
        public Patch<bool?> AttributionRequired;
        public Patch<string?> SourceKind;
        public Patch<string?> SourceUrl;
        public Patch<string?> StoreUrl;
        public Patch<string?> StoreAssetId;
        public Patch<string?> StoreItemId;
        public Patch<DateTime?> ImportedAt;

        public Dictionary<string, JsonElement> Facets { get; } = new(StringComparer.Ordinal);

        public AssetEntityMetadataWrite EntityWrite { get; set; } = new();

        public bool TouchesSideTable =>
            Description.IsSet || Tags.IsSet || Styles.IsSet || Themes.IsSet ||
            License.IsSet || LicenseName.IsSet || LicenseUrl.IsSet || Author.IsSet ||
            CreditName.IsSet || CreditUrl.IsSet || AttributionRequired.IsSet ||
            SourceKind.IsSet || SourceUrl.IsSet || StoreUrl.IsSet || StoreAssetId.IsSet ||
            StoreItemId.IsSet || ImportedAt.IsSet || Facets.Count > 0;
    }
}
