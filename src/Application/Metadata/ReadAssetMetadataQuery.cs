using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using SharedKernel;

namespace Application.Metadata;

/// <summary>
/// Reads every schema field for one asset, wherever each one lives - the asset's own entity,
/// the metadata side table, the facets bag, or the derived layer.
///
/// <para>
/// One read rather than four is the point: before this, answering "what do we know about this
/// asset" meant knowing which of six families it belonged to and which two of four places each
/// field was in.
/// </para>
/// </summary>
public sealed record ReadAssetMetadataQuery(string AssetType, int AssetId)
    : IQuery<AssetMetadataResponse>;

internal sealed class ReadAssetMetadataQueryHandler
    : IQueryHandler<ReadAssetMetadataQuery, AssetMetadataResponse>
{
    private readonly IAssetEntityMetadata _entity;
    private readonly IAssetMetadataRepository _metadata;
    private readonly IAssetSearchDocumentRepository _searchDocuments;

    public ReadAssetMetadataQueryHandler(
        IAssetEntityMetadata entity,
        IAssetMetadataRepository metadata,
        IAssetSearchDocumentRepository searchDocuments)
    {
        _entity = entity;
        _metadata = metadata;
        _searchDocuments = searchDocuments;
    }

    public async Task<Result<AssetMetadataResponse>> Handle(
        ReadAssetMetadataQuery query, CancellationToken cancellationToken)
    {
        var family = AssetMetadataSchema.NormalizeFamily(query.AssetType);
        if (family is null)
        {
            return Result.Failure<AssetMetadataResponse>(new Error(
                "UnknownAssetFamily",
                $"'{query.AssetType}' is not an asset family this schema covers. Known: {string.Join(", ", AssetMetadataSchema.Families.All)}."));
        }

        var entityState = await _entity.ReadAsync(family, query.AssetId, cancellationToken);
        if (entityState.IsFailure)
        {
            return Result.Failure<AssetMetadataResponse>(entityState.Error);
        }

        var stored = await _metadata.GetAsync(family, query.AssetId, cancellationToken);
        var document = await _searchDocuments.GetCurrentAssetDocumentAsync(family, query.AssetId, cancellationToken);
        var facets = AssetMetadataFacets.Parse(stored?.FacetsJson);

        var values = new List<AssetMetadataValue>();
        foreach (var field in AssetMetadataSchema.ForFamily(family))
        {
            var value = ResolveValue(field, entityState.Value, stored, document, facets);
            values.Add(new AssetMetadataValue(
                field.Key, field.Group, field.Type, field.Repeats, field.ReadOnly,
                field.Provenance, field.Storage, value));
        }

        return Result.Success(new AssetMetadataResponse(
            family,
            query.AssetId,
            entityState.Value.Name,
            stored?.SchemaVersion ?? 0,
            AssetMetadataSchema.Version,
            values,
            Completeness(values),
            entityState.Value.CategoryKind?.ToString()));
    }

    private static object? ResolveValue(
        AssetMetadataField field,
        AssetEntityMetadataState entity,
        AssetMetadata? stored,
        AssetSearchDocument? document,
        IReadOnlyDictionary<string, JsonElement> facets)
    {
        return field.Storage switch
        {
            AssetMetadataSchema.AssetMetadataStorage.Entity => field.Key switch
            {
                "name" => entity.Name,
                "description" => entity.Description,
                "tags" => Empty(entity.Tags) ? null : entity.Tags,
                "category" => entity.CategoryId is null
                    ? null
                    : new { id = entity.CategoryId, name = entity.CategoryName },
                _ => null
            },

            AssetMetadataSchema.AssetMetadataStorage.Metadata => field.Key switch
            {
                "description" => stored?.Description,
                "tags" => Empty(stored?.Tags) ? null : stored!.Tags.ToList(),
                "styles" => Empty(stored?.Styles) ? null : stored!.Styles.ToList(),
                "themes" => Empty(stored?.Themes) ? null : stored!.Themes.ToList(),
                "license" => stored?.License,
                "licenseName" => stored?.LicenseName,
                "licenseUrl" => stored?.LicenseUrl,
                "author" => stored?.Author,
                "creditName" => stored?.CreditName,
                "creditUrl" => stored?.CreditUrl,
                "attributionRequired" => stored?.AttributionRequired,
                "sourceKind" => stored?.SourceKind,
                "sourceFolder" => stored?.SourceFolder,
                "sourceUrl" => stored?.SourceUrl,
                "storeUrl" => stored?.StoreUrl,
                "storeAssetId" => stored?.StoreAssetId,
                "storeItemId" => stored?.StoreItemId,
                "importedAt" => stored?.ImportedAt,
                _ => null
            },

            AssetMetadataSchema.AssetMetadataStorage.Facets =>
                facets.TryGetValue(field.Key, out var facet) && facet.ValueKind != JsonValueKind.Null
                    ? facet
                    : null,

            AssetMetadataSchema.AssetMetadataStorage.Derived => document is null ? null : field.Key switch
            {
                "triangleCount" => document.TriangleCount,
                "vertexCount" => document.VertexCount,
                "materialCount" => document.MaterialCount,
                "partCount" => document.PartCount,
                "animationCount" => document.AnimationCount,
                "boneCount" => document.BoneCount,
                "hasAnimations" => document.HasAnimations,
                "hasUvs" => document.HasUvs,
                "uvStatus" => document.UvStatus,
                "dimensionX" => document.DimensionX,
                "dimensionY" => document.DimensionY,
                "dimensionZ" => document.DimensionZ,
                "maxDimension" => document.MaxDimension,
                "scaleConvention" => document.ScaleConvention,
                "geometryKey" => document.GeometryKey,
                "tileability" => document.Tileability,
                "durationClass" => document.DurationClass,
                _ => null
            },

            _ => null
        };
    }

    private static bool Empty(IEnumerable<string>? values) => values is null || !values.Any();

    /// <summary>
    /// Counts only what a caller could fill: read-only and derived fields are excluded, so a
    /// model with every measurement taken and no licence still reads as incomplete.
    /// </summary>
    private static AssetMetadataCompleteness Completeness(IReadOnlyList<AssetMetadataValue> values)
    {
        var fillable = values
            .Where(v => !v.ReadOnly && v.Storage != AssetMetadataSchema.AssetMetadataStorage.Derived)
            .ToList();

        var missing = fillable.Where(v => v.Value is null).Select(v => v.Key).ToList();

        return new AssetMetadataCompleteness(fillable.Count, fillable.Count - missing.Count, missing);
    }
}

/// <summary>Reading and writing the side table's jsonb facets bag.</summary>
internal static class AssetMetadataFacets
{
    private static readonly IReadOnlyDictionary<string, JsonElement> Empty =
        new Dictionary<string, JsonElement>(StringComparer.Ordinal);

    public static IReadOnlyDictionary<string, JsonElement> Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return Empty;

        try
        {
            using var document = JsonDocument.Parse(json);
            if (document.RootElement.ValueKind != JsonValueKind.Object) return Empty;

            var result = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
            foreach (var property in document.RootElement.EnumerateObject())
            {
                result[property.Name] = property.Value.Clone();
            }

            return result;
        }
        catch (JsonException)
        {
            // A bag we cannot parse reads as empty rather than failing the whole read: it is
            // an optional extras field, and one bad row must not make an asset unreadable.
            return Empty;
        }
    }

    public static string? Serialize(IReadOnlyDictionary<string, JsonElement> facets)
        => facets.Count == 0 ? null : JsonSerializer.Serialize(facets);
}
