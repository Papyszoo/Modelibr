using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Extraction;

/// <summary>
/// Reads the derived metadata + part detail for an asset (current version). The
/// ordinary endpoint the MCP <c>get_asset</c>/<c>get_part</c> tools wrap - no
/// MCP-specific read path.
/// </summary>
public record GetAssetMetadataQuery(string AssetType, int AssetId, string? PartPath = null)
    : IQuery<AssetMetadataResponse>;

public record AssetMetadataResponse(
    string AssetType,
    int AssetId,
    int? VersionId,
    int DeriveVersion,
    JsonElement Derived,
    IReadOnlyList<AssetPartView> Parts,
    // prompt-29: deterministic concept-label suggestions (weapon/animal/...) from the
    // asset tokens. Surfaced so a user/agent can confirm-assign; never auto-applied.
    IReadOnlyList<string> SuggestedCategories);

public record AssetPartView(
    string PartPath,
    string Name,
    string? ParentPath,
    int Depth,
    string ObjectType,
    int? TriangleCount,
    int? VertexCount,
    string? GeometryHash,
    bool? HasUvs);

internal sealed class GetAssetMetadataQueryHandler
    : IQueryHandler<GetAssetMetadataQuery, AssetMetadataResponse>
{
    private readonly IAssetDerivationRepository _derivationRepository;
    private readonly IAssetPartRepository _partRepository;

    public GetAssetMetadataQueryHandler(
        IAssetDerivationRepository derivationRepository,
        IAssetPartRepository partRepository)
    {
        _derivationRepository = derivationRepository;
        _partRepository = partRepository;
    }

    public async Task<Result<AssetMetadataResponse>> Handle(
        GetAssetMetadataQuery query,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(query.AssetType) || query.AssetId <= 0)
        {
            return Result.Failure<AssetMetadataResponse>(
                new Error("InvalidAsset", "A valid asset type and id are required."));
        }

        var assetType = query.AssetType.Trim();
        var derivation = await _derivationRepository.GetLatestForAssetAsync(assetType, query.AssetId, cancellationToken);
        if (derivation is null)
        {
            return Result.Failure<AssetMetadataResponse>(
                new Error("AssetMetadataNotFound", $"No derived metadata for {assetType} {query.AssetId}."));
        }

        var parts = await _partRepository.GetForAssetAsync(
            assetType, query.AssetId, derivation.VersionId, cancellationToken);

        var partViews = parts
            .Where(p => string.IsNullOrEmpty(query.PartPath) || p.PartPath == query.PartPath)
            .OrderBy(p => p.Depth)
            .ThenBy(p => p.PartPath, StringComparer.Ordinal)
            .Select(p => new AssetPartView(
                p.PartPath, p.Name, p.ParentPath, p.Depth, p.ObjectType,
                p.TriangleCount, p.VertexCount, p.GeometryHash, p.HasUvs))
            .ToList();

        if (!string.IsNullOrEmpty(query.PartPath) && partViews.Count == 0)
        {
            return Result.Failure<AssetMetadataResponse>(
                new Error("PartNotFound", $"No part '{query.PartPath}' on {assetType} {query.AssetId}."));
        }

        using var doc = JsonDocument.Parse(derivation.Payload);
        var derived = doc.RootElement.Clone();

        var suggestedCategories = Application.Search.CategorySuggester.Suggest(ExtractTokens(derived));

        return Result.Success(new AssetMetadataResponse(
            assetType, query.AssetId, derivation.VersionId, derivation.DeriveVersion, derived, partViews,
            suggestedCategories));
    }

    /// <summary>Pull the token list out of the serialized DerivedAsset payload.</summary>
    private static IReadOnlyList<string> ExtractTokens(JsonElement derived)
    {
        if (derived.ValueKind != JsonValueKind.Object ||
            !derived.TryGetProperty("Tokens", out var tokensElement) ||
            tokensElement.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<string>();
        }

        return tokensElement.EnumerateArray()
            .Where(t => t.ValueKind == JsonValueKind.String)
            .Select(t => t.GetString() ?? string.Empty)
            .Where(t => t.Length > 0)
            .ToList();
    }
}
