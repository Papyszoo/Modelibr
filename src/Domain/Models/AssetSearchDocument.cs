namespace Domain.Models;

/// <summary>
/// One searchable unit in the derived-layer search projection: either an asset
/// (PartPath = null) or one of its parts. Denormalised so search is a single
/// indexed table scan rather than a join across raw + derived rows.
///
/// Text is split by intent: <see cref="Tokens"/> and <see cref="Symbols"/> are
/// authored identifiers indexed <b>literally</b> (trigram, no stemming - so
/// <c>ściana</c>/<c>Wandhalterung</c> survive), while <see cref="BrowseSummary"/>
/// is prose for the full-text vector. <see cref="Prominence"/> keeps secondary
/// parts out of default results, and <see cref="IsCurrentVersion"/> keeps a
/// six-times-versioned model from returning six near-identical hits.
///
/// Documents are replaced wholesale per (AssetType, AssetId, VersionId) on
/// re-derive, so there are no in-place mutators.
/// </summary>
public class AssetSearchDocument
{
    public int Id { get; private set; }

    public string AssetType { get; private set; } = string.Empty;
    public int AssetId { get; private set; }
    public int? VersionId { get; private set; }

    /// <summary>Null for the asset-level document; the part path for a part document.</summary>
    public string? PartPath { get; private set; }

    public bool IsCurrentVersion { get; private set; }

    /// <summary>
    /// False while the underlying asset is in the recycle bin. Soft delete must hide an
    /// asset from search immediately, and restoring it must bring the asset back without
    /// waiting for a re-extraction - so deletion state is carried on the projection
    /// rather than left for the next derive to notice.
    /// </summary>
    public bool IsActive { get; private set; } = true;

    /// <summary>full / secondary / hidden (see the derived prominence layer).</summary>
    public string Prominence { get; private set; } = "full";

    public string DisplayName { get; private set; } = string.Empty;

    /// <summary>Space-joined authored tokens (top search weight), trigram-indexed.</summary>
    public string Tokens { get; private set; } = string.Empty;

    /// <summary>Space-joined declared script symbols (mesh-name weight), trigram-indexed.</summary>
    public string Symbols { get; private set; } = string.Empty;

    /// <summary>
    /// Space-joined deterministic concept labels (weapon / vehicle / building …) inferred
    /// from the authored tokens.
    ///
    /// Kept OUT of <see cref="Tokens"/> deliberately. When both lived in one field a
    /// concept match was indistinguishable from a name match, so a query for "vehicle"
    /// ranked <c>boat_ornament</c> and <c>tram_rail</c> - labelled vehicles - level with
    /// <c>SM_Veh_Car_Van_01</c>, and alphabetical tie-breaking then decided the page.
    /// Scored separately, concepts add recall without displacing an authored name.
    /// </summary>
    public string ConceptLabels { get; private set; } = string.Empty;

    /// <summary>Human-readable prose line for the full-text vector.</summary>
    public string BrowseSummary { get; private set; } = string.Empty;

    /// <summary>
    /// Space-joined tags a person assigned to this asset, matched in the same tier as
    /// <see cref="Tokens"/>.
    /// </summary>
    /// <remarks>
    /// The strongest provenance in the projection and the one that was missing entirely.
    /// Everything else here is derived from a filename or inferred from it, so a user who
    /// labelled a model "rustic oak dining chair" could not then find it by any of those
    /// words - the single most direct statement of what an asset is was the one signal
    /// search could not see. Ranked with authored tokens rather than with inferred concepts
    /// because a tag is a name someone chose, not a guess the derive step made.
    /// Asset-level documents only: tags belong to the asset, not to its meshes.
    /// </remarks>
    public string AuthoredTags { get; private set; } = string.Empty;

    /// <summary>
    /// The asset's user-written description, matched in the prose tier.
    /// </summary>
    /// <remarks>
    /// Prose rather than authored-token tier despite being authored: it is a sentence, and
    /// a word occurring inside one is weaker evidence than the same word being the asset's
    /// name. It still has to admit the document, which is the part that was missing.
    /// </remarks>
    public string Description { get; private set; } = string.Empty;

    // ---- structural filters (nullable; populated where the family supplies them) ----
    public int? TriangleCount { get; private set; }
    public bool? HasAnimations { get; private set; }
    public int? BoneCount { get; private set; }
    public string? ShapeClass { get; private set; }
    public double? Tileability { get; private set; }
    public string? DurationClass { get; private set; }
    public string? Engine { get; private set; }
    public double? GridSize { get; private set; }
    public List<string> QualityFlags { get; private set; } = new();

    // ---- prompt-29 attribute filters (already-extracted facts, projected for search) ----
    public int? VertexCount { get; private set; }
    public int? MaterialCount { get; private set; }
    public bool? HasUvs { get; private set; }

    /// <summary>
    /// How the asset's UVs are laid out - one of <see cref="Application"/>'s
    /// <c>UvStatusClassifier</c> values, or null when nothing could be measured.
    ///
    /// Separate from <see cref="HasUvs"/> because that flag answers the wrong question for
    /// baking. A palette-atlas model has UVs, so <c>hasUvs</c> is true, and it still cannot
    /// receive a baked texture set - the whole model sits on a handful of texels of a
    /// texture it shares with hundreds of others. "Does it have UVs" and "can it be baked
    /// onto" are different questions, and only the first one was answerable.
    /// </summary>
    public string? UvStatus { get; private set; }

    public int? PartCount { get; private set; }
    public int? AnimationCount { get; private set; }

    /// <summary>Largest world bounding-box dimension (metres) - the "how big" size filter.</summary>
    public double? MaxDimension { get; private set; }

    // ---- real-world size, so an agent can pick something the right size (prompt 11-A) ----

    /// <summary>
    /// The asset's own extent in metres, per axis. Denormalised onto the projection because
    /// a caller asking "what is roughly sofa-sized" must not have to place the thing to find
    /// out: the only way to read real dimensions used to be a write (<c>place_asset</c>) or
    /// <c>get_scene</c>, which cost one throwaway placement per candidate.
    /// </summary>
    public double? DimensionX { get; private set; }

    public double? DimensionY { get; private set; }

    public double? DimensionZ { get; private set; }

    /// <summary>
    /// Whether the dimensions above can be trusted as real-world size:
    /// <c>authored</c>, <c>normalized</c>, or null when there are no bounds to judge.
    ///
    /// The library is genuinely mixed - some packs ship real metres, others ship assets
    /// scaled into a unit box - and the two are indistinguishable from the numbers alone.
    /// Without this an agent places a 2 m armchair beside a 2 m wrench and nothing in the
    /// data ever said the second one was a preview artefact.
    /// </summary>
    public string? ScaleConvention { get; private set; }

    // ---- prompt-29 category bridge (the assigned user category, the semantic layer) ----
    public int? CategoryId { get; private set; }
    public string? CategoryName { get; private set; }

    /// <summary>
    /// Space-joined names of every pack this asset belongs to, denormalised for search.
    /// Author-written grouping: a human named the pack and chose to put this asset in it,
    /// so it is free taxonomy the library already has.
    ///
    /// Stored space-joined (not one row per pack) so it matches with the same
    /// boundary-ILIKE shape as <see cref="Tokens"/> and <see cref="ConceptLabels"/>, and
    /// so a pack change is a single-column patch rather than a projection rebuild.
    /// Asset-level documents only - a part does not belong to a pack, its asset does.
    /// </summary>
    public string? PackNames { get; private set; }

    /// <summary>
    /// Fingerprint of the asset's geometry: its parts' order-invariant geometry hashes,
    /// sorted and hashed together. Two assets that carry the same key are the same meshes
    /// under two ids.
    ///
    /// Asset-level documents only, and null whenever no part was hashed - an absent
    /// fingerprint must never read as "matches every other asset that also has none".
    /// </summary>
    /// <remarks>
    /// Game libraries are full of the same prop imported twice: on a real 1,717-model
    /// library <c>SM_Prop_Couch_01</c> exists at two ids with byte-identical geometry, and
    /// many POLYGON City props are doubled the same way. Nothing in a search hit said so,
    /// so an agent comparing candidates spent two of its slots on one couch.
    /// </remarks>
    public string? GeometryKey { get; private set; }

    // ---- asset metadata schema facets (prompt 16-F) ----

    /// <summary>
    /// The asset's declared styles, from the metadata schema's vocabulary.
    /// </summary>
    /// <remarks>
    /// A typed column rather than more words in <see cref="AuthoredTags"/>, because the
    /// question these answer is a filter, not a match: a project whose profile says
    /// "Low Poly" needs every asset that IS low poly, and a tag string cannot tell
    /// <c>Low Poly</c> from <c>low_poly_v2_final</c>. Stored as an array so a filter is a
    /// containment test rather than a substring one.
    /// </remarks>
    public List<string> Styles { get; private set; } = new();

    /// <summary>The asset's declared themes. Same reasoning as <see cref="Styles"/>.</summary>
    public List<string> Themes { get; private set; } = new();

    /// <summary>
    /// The recognized licence, from the metadata schema's vocabulary. Denormalised here so
    /// "find me something I can actually ship" is a filter rather than a per-hit follow-up
    /// read - which for a page of twenty candidates was twenty round trips nobody made.
    /// </summary>
    public string? License { get; private set; }

    public DateTime UpdatedAt { get; private set; }

    public static AssetSearchDocument Create(
        string assetType,
        int assetId,
        int? versionId,
        string? partPath,
        bool isCurrentVersion,
        string prominence,
        string displayName,
        string tokens,
        string browseSummary,
        DateTime updatedAt,
        string symbols = "",
        string conceptLabels = "",
        int? triangleCount = null,
        bool? hasAnimations = null,
        int? boneCount = null,
        string? shapeClass = null,
        double? tileability = null,
        string? durationClass = null,
        string? engine = null,
        double? gridSize = null,
        IEnumerable<string>? qualityFlags = null,
        int? vertexCount = null,
        int? materialCount = null,
        bool? hasUvs = null,
        string? uvStatus = null,
        int? partCount = null,
        int? animationCount = null,
        double? maxDimension = null,
        int? categoryId = null,
        string? categoryName = null,
        bool isActive = true,
        IEnumerable<string>? packNames = null,
        double? dimensionX = null,
        double? dimensionY = null,
        double? dimensionZ = null,
        string? scaleConvention = null,
        IEnumerable<string>? authoredTags = null,
        string? description = null,
        string? geometryKey = null,
        IEnumerable<string>? styles = null,
        IEnumerable<string>? themes = null,
        string? license = null)
    {
        if (string.IsNullOrWhiteSpace(assetType))
            throw new ArgumentException("Asset type cannot be null or whitespace.", nameof(assetType));
        if (assetId <= 0)
            throw new ArgumentException("Asset id must be greater than 0.", nameof(assetId));
        if (versionId.HasValue && versionId.Value <= 0)
            throw new ArgumentException("Version id must be greater than 0 when provided.", nameof(versionId));

        return new AssetSearchDocument
        {
            AssetType = assetType.Trim(),
            AssetId = assetId,
            VersionId = versionId,
            PartPath = string.IsNullOrWhiteSpace(partPath) ? null : partPath.Trim(),
            IsCurrentVersion = isCurrentVersion,
            IsActive = isActive,
            Prominence = string.IsNullOrWhiteSpace(prominence) ? "full" : prominence.Trim(),
            DisplayName = displayName ?? string.Empty,
            Tokens = tokens ?? string.Empty,
            Symbols = symbols ?? string.Empty,
            ConceptLabels = conceptLabels ?? string.Empty,
            BrowseSummary = browseSummary ?? string.Empty,
            AuthoredTags = NormalizeTags(authoredTags),
            Description = description?.Trim() ?? string.Empty,
            GeometryKey = string.IsNullOrWhiteSpace(geometryKey) ? null : geometryKey.Trim(),
            Styles = NormalizeValues(styles),
            Themes = NormalizeValues(themes),
            License = string.IsNullOrWhiteSpace(license) ? null : license.Trim(),
            TriangleCount = triangleCount,
            HasAnimations = hasAnimations,
            BoneCount = boneCount,
            ShapeClass = shapeClass,
            Tileability = tileability,
            DurationClass = durationClass,
            Engine = engine,
            GridSize = gridSize,
            QualityFlags = (qualityFlags ?? Enumerable.Empty<string>()).ToList(),
            VertexCount = vertexCount,
            MaterialCount = materialCount,
            HasUvs = hasUvs,
            UvStatus = string.IsNullOrWhiteSpace(uvStatus) ? null : uvStatus.Trim(),
            PartCount = partCount,
            AnimationCount = animationCount,
            MaxDimension = maxDimension,
            DimensionX = dimensionX,
            DimensionY = dimensionY,
            DimensionZ = dimensionZ,
            ScaleConvention = scaleConvention,
            CategoryId = categoryId,
            CategoryName = string.IsNullOrWhiteSpace(categoryName) ? null : categoryName.Trim(),
            PackNames = NormalizePackNames(packNames),
            UpdatedAt = updatedAt
        };
    }

    /// <summary>
    /// Trims and space-joins pack names, collapsing empties away. Returns null rather
    /// than an empty string so "belongs to no pack" is one value, not two.
    /// </summary>
    private static string? NormalizePackNames(IEnumerable<string>? packNames)
    {
        if (packNames is null) return null;
        var cleaned = packNames
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Select(n => n.Trim())
            // Sorted so the stored blob depends only on WHICH packs an asset is in, not on
            // the order the caller happened to assemble them. Order carries no meaning for
            // matching (every clause is a boundary ILIKE), so leaving it caller-dependent
            // would only make the same membership persist as two different strings - and
            // the backfill migration already sorts.
            .OrderBy(n => n, StringComparer.Ordinal)
            .ToList();
        return cleaned.Count == 0 ? null : string.Join(' ', cleaned);
    }

    /// <summary>Flips the current-version marker (used when a newer version becomes active).</summary>
    public void SetCurrentVersion(bool isCurrent) => IsCurrentVersion = isCurrent;

    /// <summary>Hides (or unhides) the document when the asset is recycled or restored.</summary>
    public void SetActive(bool isActive) => IsActive = isActive;

    /// <summary>
    /// Re-points the denormalised category fields after a category-only mutation, so an
    /// agent that calls <c>set_category</c> can immediately confirm the write with a
    /// category-filtered search instead of waiting for the next re-derive.
    /// </summary>
    public void SetCategory(int? categoryId, string? categoryName)
    {
        CategoryId = categoryId;
        CategoryName = string.IsNullOrWhiteSpace(categoryName) ? null : categoryName.Trim();
    }

    /// <summary>
    /// Re-points the denormalised pack names after a membership-only mutation.
    ///
    /// Pack membership changes AFTER extraction - add_to_pack, remove, pack rename and
    /// pack delete all happen without re-deriving the asset - so a projection that only
    /// learned pack names at build time would be stale from the first add. Patching in
    /// place is the same contract <see cref="SetCategory"/> already provides.
    /// </summary>
    public void SetPacks(IEnumerable<string>? packNames)
    {
        PackNames = NormalizePackNames(packNames);
    }

    /// <summary>
    /// Re-points the denormalised tags and description after a metadata-only mutation.
    /// </summary>
    /// <remarks>
    /// Tagging does not re-derive an asset, so without this a projection would only ever
    /// hold the tags an asset happened to have at extraction time - which for anything
    /// tagged after import is none. Same contract as <see cref="SetCategory"/> and
    /// <see cref="SetPacks"/>: the write that changes what a person said about an asset
    /// changes what search can find it by, in the same transaction.
    /// </remarks>
    public void SetMetadata(IEnumerable<string>? tags, string? description)
    {
        AuthoredTags = NormalizeTags(tags);
        Description = description?.Trim() ?? string.Empty;
    }

    /// <summary>
    /// Re-points the denormalised metadata-schema facets after a metadata write.
    ///
    /// Same contract as <see cref="SetCategory"/>, <see cref="SetPacks"/> and
    /// <see cref="SetMetadata"/>: the write that changes what an asset says about itself
    /// changes what search can filter it by, in the same transaction. Without it, a style
    /// set today would only reach search the next time the asset happened to be re-derived.
    /// </summary>
    public void SetSchemaFacets(IEnumerable<string>? styles, IEnumerable<string>? themes, string? license)
    {
        Styles = NormalizeValues(styles);
        Themes = NormalizeValues(themes);
        License = string.IsNullOrWhiteSpace(license) ? null : license.Trim();
    }

    /// <summary>
    /// Trims, de-duplicates and sorts a facet list, so the stored array depends only on
    /// WHICH values an asset carries and not on the order a caller assembled them.
    /// </summary>
    private static List<string> NormalizeValues(IEnumerable<string>? values)
    {
        if (values is null) return new List<string>();

        return values
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .Select(v => v.Trim())
            .Distinct(StringComparer.Ordinal)
            .OrderBy(v => v, StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>
    /// Trims and space-joins tag names. Empty string rather than null, matching
    /// <see cref="Tokens"/> - the match clauses concatenate this column directly, and a null
    /// would turn the whole expression null and silently drop the document from the tier.
    /// </summary>
    private static string NormalizeTags(IEnumerable<string>? tags)
    {
        if (tags is null) return string.Empty;
        return string.Join(' ', tags
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Select(t => t.Trim())
            .OrderBy(t => t, StringComparer.Ordinal));
    }
}
