namespace Domain.Models;

/// <summary>
/// The authored metadata that no asset family had a home for: descriptive facets, rights,
/// and where the asset came from. One row per (<see cref="AssetType"/>, <see cref="AssetId"/>),
/// shared by every family rather than six near-identical column sets on six entities.
///
/// <para>
/// It is a side table for the same reason <c>AssetSearchDocument</c> is: the fields here are
/// universal, they arrive from a different source than the asset's own bytes (a manifest, a
/// person, a population pass), and adding a licence column to six aggregates would make
/// "does this asset say who to credit" a six-way question.
/// </para>
///
/// <para>
/// <see cref="SchemaVersion"/> is stamped on write so a later pass can tell a row that
/// predates a field from one where the field was checked and is genuinely empty - the
/// difference between "not asked yet" and "asked, nothing there".
/// </para>
///
/// <para>
/// It also carries <see cref="Description"/> and <see cref="Tags"/> for families whose
/// entity has no column of its own - today that is <see cref="Description"/> for TextureSet
/// and EnvironmentMap, and <see cref="Tags"/> for nobody, since part D gave Sound and Sprite
/// their own. The schema's storage pointer says which home is current for each family, and
/// nothing reads both homes for one family. <see cref="Tags"/> is kept rather than dropped
/// because it is the fallback a new family lands on before it grows its own join.
/// </para>
/// </summary>
public class AssetMetadata : AggregateRoot
{
    private readonly List<string> _tags = new();
    private readonly List<string> _styles = new();
    private readonly List<string> _themes = new();
    private readonly List<string> _autoTags = new();

    public int Id { get; private set; }

    /// <summary>The asset family - one of the schema's family names.</summary>
    public string AssetType { get; private set; } = string.Empty;

    public int AssetId { get; private set; }

    /// <summary>The schema version this row was last written under.</summary>
    public int SchemaVersion { get; private set; }

    // ---- descriptive ----
    public string? Description { get; private set; }

    public ICollection<string> Tags
    {
        get => _tags;
        set => Replace(_tags, value);
    }

    public ICollection<string> Styles
    {
        get => _styles;
        set => Replace(_styles, value);
    }

    public ICollection<string> Themes
    {
        get => _themes;
        set => Replace(_themes, value);
    }

    // ---- rights ----
    public string? License { get; private set; }

    /// <summary>The licence exactly as the source stated it, kept even when it maps to a known one.</summary>
    public string? LicenseName { get; private set; }

    public string? LicenseUrl { get; private set; }
    public string? Author { get; private set; }
    public string? CreditName { get; private set; }
    public string? CreditUrl { get; private set; }
    public bool? AttributionRequired { get; private set; }

    // ---- provenance ----
    public string? SourceKind { get; private set; }
    public string? SourceUrl { get; private set; }
    public string? StoreUrl { get; private set; }
    public string? StoreAssetId { get; private set; }

    /// <summary>
    /// The store pack item this asset came from. The key a population pass matches on, and
    /// the identity prompt 08 needs to stop two items sharing a file from merging.
    /// </summary>
    public string? StoreItemId { get; private set; }

    public DateTime? ImportedAt { get; private set; }

    /// <summary>
    /// The directory the asset's primary file was read from at import, as the importing
    /// side saw it. Present for path imports and archives - an HTTP upload carries a
    /// filename and nothing else, so it stays null there.
    /// </summary>
    /// <remarks>
    /// Kept because the folder an asset sits in is a real, free taxonomy that nothing else
    /// records: POLYGON City ships <c>SourceFiles/Characters/…</c>, and an asset in a folder
    /// of <c>SM_Veh_*</c> is a vehicle even when its own name is <c>SM_Veh_Wheel_03</c>. It
    /// feeds both the low-weight folder tier in search and the import-time tag suggestions.
    /// </remarks>
    public string? SourceFolder { get; private set; }

    // ---- import automation (prompt 06-C) ----

    /// <summary>
    /// Tags the import automation added, as opposed to ones a person typed. The tags
    /// themselves live in the family's own tag relation - this is the provenance record
    /// that says which of them were machine-derived, so a review screen can show what was
    /// guessed and a correction can tell the two apart.
    /// </summary>
    public ICollection<string> AutoTags
    {
        get => _autoTags;
        set => Replace(_autoTags, value);
    }

    /// <summary>
    /// The category the import automation assigned, or null when nothing matched or the
    /// asset already had one. The assignment itself lives on the asset; this records that
    /// it was inferred rather than chosen.
    /// </summary>
    public int? AutoCategoryId { get; private set; }

    /// <summary>
    /// When the automation last ran for this asset. Non-null is the "already done" marker:
    /// automation runs <b>once</b>, because its inputs (the name and the folder) do not
    /// change, and re-running it on every re-derive would keep re-adding tags the user had
    /// deliberately removed.
    /// </summary>
    public DateTime? AutoAppliedAt { get; private set; }

    /// <summary>
    /// When a person confirmed or corrected what the automation did. Null while the asset
    /// is still waiting in the "N assets categorized automatically - review" queue.
    /// </summary>
    public DateTime? AutoReviewedAt { get; private set; }

    /// <summary>
    /// Schema-declared per-family extras that do not earn a column, as a JSON object.
    /// Null when the asset has none.
    /// </summary>
    public string? FacetsJson { get; private set; }

    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    public static AssetMetadata Create(string assetType, int assetId, int schemaVersion, DateTime createdAt)
    {
        if (string.IsNullOrWhiteSpace(assetType))
            throw new ArgumentException("Asset type cannot be null or empty.", nameof(assetType));
        if (assetId <= 0)
            throw new ArgumentException("Asset id must be greater than 0.", nameof(assetId));

        return new AssetMetadata
        {
            AssetType = assetType.Trim(),
            AssetId = assetId,
            SchemaVersion = schemaVersion,
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };
    }

    /// <summary>
    /// Replaces the descriptive block. Callers pass the <b>effective</b> value - the merge of
    /// what was there with what the write set - because a metadata write is a patch and only
    /// the caller knows which fields it meant to leave alone.
    /// </summary>
    public void SetDescriptive(
        string? description,
        IEnumerable<string>? tags,
        IEnumerable<string>? styles,
        IEnumerable<string>? themes,
        DateTime updatedAt)
    {
        Description = Trimmed(description);
        Replace(_tags, tags);
        Replace(_styles, styles);
        Replace(_themes, themes);
        UpdatedAt = updatedAt;
    }

    public void SetRights(
        string? license,
        string? licenseName,
        string? licenseUrl,
        string? author,
        string? creditName,
        string? creditUrl,
        bool? attributionRequired,
        DateTime updatedAt)
    {
        License = Trimmed(license);
        LicenseName = Trimmed(licenseName);
        LicenseUrl = Trimmed(licenseUrl);
        Author = Trimmed(author);
        CreditName = Trimmed(creditName);
        CreditUrl = Trimmed(creditUrl);
        AttributionRequired = attributionRequired;
        UpdatedAt = updatedAt;
    }

    public void SetProvenance(
        string? sourceKind,
        string? sourceUrl,
        string? storeUrl,
        string? storeAssetId,
        string? storeItemId,
        DateTime? importedAt,
        DateTime updatedAt)
    {
        SourceKind = Trimmed(sourceKind);
        SourceUrl = Trimmed(sourceUrl);
        StoreUrl = Trimmed(storeUrl);
        StoreAssetId = Trimmed(storeAssetId);
        StoreItemId = Trimmed(storeItemId);
        ImportedAt = importedAt;
        UpdatedAt = updatedAt;
    }

    /// <summary>Records where the asset's primary file was read from at import.</summary>
    public void SetSourceFolder(string? sourceFolder, DateTime updatedAt)
    {
        SourceFolder = Trimmed(sourceFolder);
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Records what the import automation applied. Called once per asset - see
    /// <see cref="AutoAppliedAt"/> - with the tags it added and the category it chose.
    /// </summary>
    public void RecordAutoAssignment(
        IEnumerable<string>? autoTags,
        int? autoCategoryId,
        DateTime appliedAt)
    {
        Replace(_autoTags, autoTags);
        AutoCategoryId = autoCategoryId;
        AutoAppliedAt = appliedAt;
        UpdatedAt = appliedAt;
    }

    /// <summary>
    /// Marks the automation's guesses as seen by a person. Idempotent, and deliberately
    /// separate from correcting them: accepting and editing both end the review, and the
    /// screen only needs to know the asset has left the queue.
    /// </summary>
    public void MarkAutoReviewed(DateTime reviewedAt)
    {
        if (AutoAppliedAt is null) return;
        AutoReviewedAt = reviewedAt;
        UpdatedAt = reviewedAt;
    }

    public void SetFacets(string? facetsJson, DateTime updatedAt)
    {
        FacetsJson = string.IsNullOrWhiteSpace(facetsJson) ? null : facetsJson;
        UpdatedAt = updatedAt;
    }

    /// <summary>Records which schema version last wrote this row.</summary>
    public void StampSchemaVersion(int schemaVersion, DateTime updatedAt)
    {
        SchemaVersion = schemaVersion;
        UpdatedAt = updatedAt;
    }

    private static string? Trimmed(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>
    /// Replaces a list in place, dropping blanks and duplicates. In place rather than by
    /// reassignment because EF tracks the backing collection.
    /// </summary>
    private static void Replace(List<string> target, IEnumerable<string>? values)
    {
        target.Clear();
        if (values is null) return;

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var value in values)
        {
            if (string.IsNullOrWhiteSpace(value)) continue;
            var trimmed = value.Trim();
            if (seen.Add(trimmed))
            {
                target.Add(trimmed);
            }
        }
    }
}
