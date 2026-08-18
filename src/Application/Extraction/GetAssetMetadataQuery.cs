using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Extraction;

/// <summary>
/// Reads the derived metadata + part detail for an asset. The ordinary endpoint the MCP
/// <c>get_asset</c>/<c>get_part</c> tools wrap - no MCP-specific read path.
/// </summary>
/// <param name="VersionId">
/// Which version to read. Omitted means the asset's <b>active</b> version - the one search
/// returns and scene nodes pin. Callers holding a search hit should pass that hit's version
/// explicitly: it removes the window where a rollback between the search and this call
/// silently answers about a different version.
/// </param>
public record GetAssetMetadataQuery(
    string AssetType,
    int AssetId,
    string? PartPath = null,
    int? VersionId = null)
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
    IReadOnlyList<string> SuggestedCategories,
    // Every slot name on the asset, deduplicated. apply_material dresses a node, not a
    // part, so the union is the set that call can actually target - reading it off the
    // per-part lists would make the caller reassemble it every time.
    IReadOnlyList<string> MaterialSlots);

/// <param name="MaterialSlots">
/// The part's own material slot names, as authored. These are the strings
/// <c>apply_material</c>'s <c>slot</c> argument expects; the worker extracts them into the
/// part's detail JSON, but nothing surfaced them, so the slot argument could only ever be
/// guessed at.
/// </param>
public record AssetPartView(
    string PartPath,
    string Name,
    string? ParentPath,
    int Depth,
    string ObjectType,
    int? TriangleCount,
    int? VertexCount,
    string? GeometryHash,
    bool? HasUvs,
    IReadOnlyList<string> MaterialSlots);

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

        // An explicit version is answered exactly or not at all. Silently falling back to
        // the active version would defeat the point of asking: the caller passed a version
        // precisely because it needs the facts for that one.
        var derivation = query.VersionId is { } requestedVersion
            ? await _derivationRepository.GetByKeyAsync(assetType, query.AssetId, requestedVersion, cancellationToken)
            : await _derivationRepository.GetForActiveVersionAsync(assetType, query.AssetId, cancellationToken);

        if (derivation is null)
        {
            return Result.Failure<AssetMetadataResponse>(
                new Error(
                    "AssetMetadataNotFound",
                    query.VersionId is { } missingVersion
                        ? $"No derived metadata for {assetType} {query.AssetId} version {missingVersion}."
                        : $"No derived metadata for {assetType} {query.AssetId}."));
        }

        var parts = await _partRepository.GetForAssetAsync(
            assetType, query.AssetId, derivation.VersionId, cancellationToken);

        var partViews = parts
            .Where(p => string.IsNullOrEmpty(query.PartPath) || p.PartPath == query.PartPath)
            .OrderBy(p => p.Depth)
            .ThenBy(p => p.PartPath, StringComparer.Ordinal)
            .Select(p => new AssetPartView(
                p.PartPath, p.Name, p.ParentPath, p.Depth, p.ObjectType,
                p.TriangleCount, p.VertexCount, p.GeometryHash, p.HasUvs,
                AssetPartDetail.MaterialSlots(p.Detail)))
            .ToList();

        if (!string.IsNullOrEmpty(query.PartPath) && partViews.Count == 0)
        {
            return Result.Failure<AssetMetadataResponse>(
                new Error("PartNotFound", $"No part '{query.PartPath}' on {assetType} {query.AssetId}."));
        }

        using var doc = JsonDocument.Parse(derivation.Payload);
        var derived = doc.RootElement.Clone();

        var suggestedCategories = Application.Search.CategorySuggester.Suggest(ExtractTokens(derived));

        // Built from every part, not just the ones a part-path filter left standing: an
        // agent calling get_part still needs to know what the whole node can be dressed by.
        var materialSlots = parts
            .SelectMany(p => AssetPartDetail.MaterialSlots(p.Detail))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(s => s, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return Result.Success(new AssetMetadataResponse(
            assetType, query.AssetId, derivation.VersionId, derivation.DeriveVersion, derived, partViews,
            suggestedCategories, materialSlots));
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
