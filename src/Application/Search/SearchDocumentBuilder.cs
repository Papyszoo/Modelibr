using System.Security.Cryptography;
using System.Text;
using Application.Extraction.Derivation;
using Application.Models;
using Domain.Models;

namespace Application.Search;

/// <summary>
/// Projects a derived asset (prompt 23) into search documents: one asset-level
/// document plus one per non-hidden, non-degenerate part. Hidden parts (collision
/// proxies, non-zero LODs, helpers) and zero-volume parts are left out of the index
/// entirely.
/// </summary>
public static class SearchDocumentBuilder
{
    /// <summary>
    /// Quality flag set by <c>AssetDerivationEngine</c> when every dimension of a part's
    /// bounding box is zero or negative.
    /// </summary>
    private const string DegenerateBoundsFlag = "degenerate_bounds";

    /// <summary>
    /// How close an asset's longest axis must sit to a unit box for its size to be read as a
    /// preview artefact rather than a measurement. Deliberately tight: an authored 2.19 m
    /// sofa must stay "authored", and only a longest axis that lands on 1 or 2 almost exactly
    /// is the fingerprint of a bounds-normalising exporter. On the 1762-model library this
    /// separates 59 normalised-to-2 and 31 normalised-to-1 assets from 1672 real ones.
    /// </summary>
    private const double NormalizedSizeEpsilon = 0.001;

    public const string ScaleAuthored = "authored";
    public const string ScaleNormalized = "normalized";

    /// <summary>One axis of a dimension triple, or null when it is absent or non-positive.</summary>
    private static double? Axis(IReadOnlyList<double>? dims, int index) =>
        dims is { } d && d.Count > index && d[index] > 0 ? d[index] : null;

    /// <summary>
    /// Whether a set of dimensions can be trusted as real-world size. Null when there is
    /// nothing to judge - "unknown" and "authored" must not collapse into each other, since
    /// an agent treats the second as a licence to place at scale 1.
    /// </summary>
    public static string? ClassifyScale(double? maxDimension)
    {
        if (maxDimension is not { } max || max <= 0)
        {
            return null;
        }

        return Math.Abs(max - 1.0) < NormalizedSizeEpsilon || Math.Abs(max - 2.0) < NormalizedSizeEpsilon
            ? ScaleNormalized
            : ScaleAuthored;
    }

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
        string? categoryName = null,
        bool isActive = true,
        IEnumerable<string>? packNames = null,
        IReadOnlyList<double>? assetDimensions = null,
        IEnumerable<string>? authoredTags = null,
        string? description = null,
        IEnumerable<string>? styles = null,
        IEnumerable<string>? themes = null,
        string? license = null)
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
        // category filter. Widening is what makes Synty's `SM_Bld_Apartment_01` - which
        // tokenises to `bld, apartment` - reachable by the word "building".
        // Suggestion improves recall; it never mutates the user's category assignment.
        var widenedTokens = SearchVocabulary.ExpandForIndex(derived.Tokens);
        var suggestedLabels = CategorySuggester.Suggest(widenedTokens);
        var assetTokens = widenedTokens
            .Concat(CategoryNameTokens(categoryName))
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Distinct(StringComparer.OrdinalIgnoreCase);
        // Concept labels go in their own field so a "vehicle" that is only a vehicle by
        // inference cannot rank level with one whose author named it that.
        var conceptLabels = suggestedLabels
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Distinct(StringComparer.OrdinalIgnoreCase);

        // Prefer the caller's dimensions - the model version's own bounding box - over the
        // extraction rollups. The rollups were the only source, and for anything extracted
        // before `7f0c7c77` they hold the post-`normalizeModel` thumbnail framing box, so
        // every one of the 1762 models in the library indexed its longest axis as exactly 2
        // and `minSize`/`maxSize` matched nothing at all. The version row is written from
        // the pre-normalization size and is real for both old and new extractions.
        var dims = assetDimensions is { Count: 3 } && assetDimensions.Any(d => d > 0)
            ? assetDimensions
            : rollups.WorldBounds?.Dimensions;
        var maxDimension = dims is { Count: > 0 } ? dims.Where(d => d > 0).DefaultIfEmpty(0).Max() : (double?)null;
        var scaleConvention = ClassifyScale(maxDimension);
        var assetHasUvs = rawParts.Any(p => p.HasUvs == true)
            ? true
            : rawParts.Any(p => p.HasUvs == false) ? false : (bool?)null;
        // Asset-level only. A UV layout is a property of the whole asset - meshes sharing
        // one atlas between them are correctly unwrapped, and asking the question of each
        // mesh alone would call every one of them packed. See UvStatusClassifier.
        var uvStatus = UvStatusClassifier.Classify(rawParts);
        var geometryKey = GeometryKeyOf(rawParts);

        docs.Add(AssetSearchDocument.Create(
            assetType: "Model",
            assetId: modelId,
            versionId: versionId,
            partPath: null,
            isCurrentVersion: isCurrentVersion,
            isActive: isActive,
            prominence: Prominence.Full,
            displayName: assetDisplay,
            tokens: string.Join(' ', assetTokens),
            conceptLabels: string.Join(' ', conceptLabels),
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
            uvStatus: uvStatus,
            partCount: rollups.MeshCount,
            animationCount: rollups.AnimationCount,
            maxDimension: maxDimension is > 0 ? maxDimension : null,
            dimensionX: Axis(dims, 0),
            dimensionY: Axis(dims, 1),
            dimensionZ: Axis(dims, 2),
            scaleConvention: scaleConvention,
            categoryId: categoryId,
            categoryName: categoryName,
            // Asset-level only: a part does not belong to a pack, the asset it came from
            // does. Putting pack names on parts would also multiply the same weak signal
            // by the part count and let a many-part asset dominate a pack-name query.
            packNames: packNames,
            // Same reasoning, and the same scope: a person tags and describes the asset.
            // Re-derivation rebuilds documents wholesale, so these have to be carried in
            // here as well as patched on a tag edit - otherwise every re-extraction would
            // quietly drop the tags the user had assigned.
            authoredTags: authoredTags,
            description: description,
            // Carried through a re-derive rather than left to be re-set afterwards: the
            // projection is rebuilt wholesale, so anything the build does not receive is
            // silently blanked - the exact defect that once wiped authored tags.
            styles: styles,
            themes: themes,
            license: license,
            geometryKey: geometryKey));

        foreach (var part in derived.Parts)
        {
            if (part.Prominence == Prominence.Hidden)
            {
                continue;
            }
            // A part whose bounding box is zero in every dimension occupies no space, so
            // it can never be a sensible answer to a query that is looking for something
            // to place in a scene. Left in the index it actively outranks real geometry:
            // on the 1,717-model library `car` with maxTriangles=10000 returned an
            // 8-triangle, 0x0x0 m node at rank #1, because a tiny token blob matches a
            // short query more completely than a fully-named mesh does. An agent building
            // a street would have placed an invisible car.
            //
            // Excluded rather than demoted, matching how Hidden parts are treated: the
            // asset-level document is unaffected, so the asset itself stays findable by
            // name and nothing becomes unreachable. Triangle count is deliberately NOT
            // part of this test - a low-poly billboard is legitimately 2 triangles, and
            // zero volume is the signal that actually means "not a placeable thing".
            if (part.QualityFlags.Contains(DegenerateBoundsFlag))
            {
                continue;
            }
            docs.Add(AssetSearchDocument.Create(
                assetType: "Model",
                assetId: modelId,
                versionId: versionId,
                partPath: part.PartPath,
                isCurrentVersion: isCurrentVersion,
                isActive: isActive,
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

    /// <summary>
    /// The asset's geometry fingerprint: its parts' hashes, deduplicated, sorted and hashed
    /// together, so two imports of the same prop land on the same string.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Sorted because part order is an authoring accident, not a difference in the geometry;
    /// deduplicated because a kit that repeats one mesh four times and a kit that repeats it
    /// five times are the same set of shapes to someone choosing what to place.
    /// </para>
    /// <para>
    /// Null when no part carries a hash. Two assets that were both never hashed have nothing
    /// in common, and a shared "unhashed" sentinel would collapse the entire unhashed half of
    /// a library into one search result.
    /// </para>
    /// </remarks>
    public static string? GeometryKeyOf(IReadOnlyList<SceneGraphPartDto> rawParts)
    {
        var hashes = rawParts
            .Select(p => p.GeometryHash)
            .Where(h => !string.IsNullOrWhiteSpace(h))
            .Select(h => h!.Trim())
            .Distinct(StringComparer.Ordinal)
            .OrderBy(h => h, StringComparer.Ordinal)
            .ToList();

        if (hashes.Count == 0)
        {
            return null;
        }

        var joined = string.Join('\n', hashes);
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(joined))).ToLowerInvariant();
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
