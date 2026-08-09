using Application.Extraction.Derivation;
using Application.Models;
using Domain.Models;

namespace Application.Search;

/// <summary>
/// Projects a derived asset (prompt 23) into search documents: one asset-level
/// document plus one per non-hidden part. Hidden parts (collision proxies,
/// non-zero LODs, helpers) are left out of the index entirely.
/// </summary>
public static class SearchDocumentBuilder
{
    public static IReadOnlyList<AssetSearchDocument> BuildForModel(
        int modelId,
        int versionId,
        bool isCurrentVersion,
        string? assetName,
        DerivedAsset derived,
        SceneGraphRollupsDto rollups,
        IReadOnlyList<SceneGraphPartDto> rawParts,
        DateTime now,
        int? categoryId = null,
        string? categoryName = null)
    {
        var rawByPath = rawParts
            .GroupBy(p => p.PartPath)
            .ToDictionary(g => g.Key, g => g.First());
        var trianglesByPath = rawByPath.ToDictionary(kv => kv.Key, kv => kv.Value.TriangleCount);

        var docs = new List<AssetSearchDocument>();

        var assetDisplay = string.IsNullOrWhiteSpace(assetName) ? $"Model {modelId}" : assetName.Trim();
        var hasAnimations = rollups.AnimationCount is > 0;

        // Semantic bridge: widen the authored tokens (abbreviations, adjacent-token
        // compounds, synonyms) and fold in the assigned category name plus deterministic
        // concept labels, so conceptual free-text queries hit even without an explicit
        // category filter. Widening is what makes Synty's `SM_Bld_Apartment_01` — which
        // tokenises to `bld, apartment` — reachable by the word "building".
        // Suggestion improves recall; it never mutates the user's category assignment.
        var widenedTokens = SearchVocabulary.ExpandForIndex(derived.Tokens);
        var suggestedLabels = CategorySuggester.Suggest(widenedTokens);
        var assetTokens = widenedTokens
            .Concat(suggestedLabels)
            .Concat(CategoryNameTokens(categoryName))
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Distinct(StringComparer.OrdinalIgnoreCase);

        var dims = rollups.WorldBounds?.Dimensions;
        var maxDimension = dims is { Count: > 0 } ? dims.Where(d => d > 0).DefaultIfEmpty(0).Max() : (double?)null;
        var assetHasUvs = rawParts.Any(p => p.HasUvs == true)
            ? true
            : rawParts.Any(p => p.HasUvs == false) ? false : (bool?)null;

        docs.Add(AssetSearchDocument.Create(
            assetType: "Model",
            assetId: modelId,
            versionId: versionId,
            partPath: null,
            isCurrentVersion: isCurrentVersion,
            prominence: Prominence.Full,
            displayName: assetDisplay,
            tokens: string.Join(' ', assetTokens),
            browseSummary: derived.BrowseSummary,
            updatedAt: now,
            triangleCount: rollups.TotalTriangles,
            hasAnimations: hasAnimations,
            boneCount: rollups.BoneCount,
            shapeClass: derived.ShapeClass,
            gridSize: derived.GridSize,
            qualityFlags: derived.QualityFlags,
            vertexCount: rollups.TotalVertices,
            materialCount: rollups.MaterialCount,
            hasUvs: assetHasUvs,
            partCount: rollups.MeshCount,
            animationCount: rollups.AnimationCount,
            maxDimension: maxDimension is > 0 ? maxDimension : null,
            categoryId: categoryId,
            categoryName: categoryName));

        foreach (var part in derived.Parts)
        {
            if (part.Prominence == Prominence.Hidden)
            {
                continue;
            }
            docs.Add(AssetSearchDocument.Create(
                assetType: "Model",
                assetId: modelId,
                versionId: versionId,
                partPath: part.PartPath,
                isCurrentVersion: isCurrentVersion,
                prominence: part.Prominence,
                displayName: part.PartPath.Split('/', '\\')[^1],
                tokens: string.Join(' ', SearchVocabulary.ExpandForIndex(part.Tokens)),
                browseSummary: part.BrowseSummary,
                updatedAt: now,
                triangleCount: trianglesByPath.GetValueOrDefault(part.PartPath),
                shapeClass: part.ShapeClass,
                qualityFlags: part.QualityFlags,
                vertexCount: rawByPath.GetValueOrDefault(part.PartPath)?.VertexCount,
                hasUvs: rawByPath.GetValueOrDefault(part.PartPath)?.HasUvs));
        }

        return docs;
    }

    private static IEnumerable<string> CategoryNameTokens(string? categoryName)
    {
        if (string.IsNullOrWhiteSpace(categoryName)) return Enumerable.Empty<string>();
        // Split into word tokens so "Sci-Fi Weapons" contributes "sci", "fi", "weapons".
        return categoryName
            .Split(new[] { ' ', '-', '_', '/', '\\', ',' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(t => t.Trim())
            .Where(t => t.Length > 0);
    }
}
