namespace Application.Abstractions.Repositories;

/// <summary>
/// True per-category asset totals for a single asset type, computed in one
/// grouped query independent of any list filter. Drives the category-sidebar
/// count badges (All / per-category / Unassigned) so they show real totals
/// rather than whatever a paginated list happened to load.
/// </summary>
/// <param name="PerCategory">Direct asset count keyed by category id (assets
/// whose category is exactly that id — not its descendants).</param>
/// <param name="UncategorizedCount">Assets with no category.</param>
/// <param name="TotalCount">All assets (categorized + uncategorized).</param>
public sealed record CategoryAssetCounts(
    IReadOnlyDictionary<int, int> PerCategory,
    int UncategorizedCount,
    int TotalCount);
