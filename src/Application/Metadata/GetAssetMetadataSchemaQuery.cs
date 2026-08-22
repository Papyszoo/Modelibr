using Application.Abstractions.Messaging;
using SharedKernel;

namespace Application.Metadata;

/// <summary>
/// Serves the metadata schema itself. The contract a population pass writes against and the
/// only place the field set is stated - so "what can an asset carry" is answerable without
/// reading six entities and guessing.
/// </summary>
/// <param name="AssetType">One family, or null for all of them.</param>
public sealed record GetAssetMetadataSchemaQuery(string? AssetType = null)
    : IQuery<AssetMetadataSchemaResponse>;

internal sealed class GetAssetMetadataSchemaQueryHandler
    : IQueryHandler<GetAssetMetadataSchemaQuery, AssetMetadataSchemaResponse>
{
    public Task<Result<AssetMetadataSchemaResponse>> Handle(
        GetAssetMetadataSchemaQuery query, CancellationToken cancellationToken)
    {
        IReadOnlyList<string> families;

        if (string.IsNullOrWhiteSpace(query.AssetType))
        {
            families = AssetMetadataSchema.Families.All;
        }
        else
        {
            var family = AssetMetadataSchema.NormalizeFamily(query.AssetType);
            if (family is null)
            {
                return Task.FromResult(Result.Failure<AssetMetadataSchemaResponse>(new Error(
                    "UnknownAssetFamily",
                    $"'{query.AssetType}' is not an asset family this schema covers. Known: {string.Join(", ", AssetMetadataSchema.Families.All)}.")));
            }

            families = new[] { family };
        }

        var response = new AssetMetadataSchemaResponse(
            AssetMetadataSchema.Version,
            families
                .Select(f => new AssetMetadataFamilySchema(f, AssetMetadataSchema.ForFamily(f)))
                .ToList());

        return Task.FromResult(Result.Success(response));
    }
}
