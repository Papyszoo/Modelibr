namespace Application.StoreImports;

/// <summary>
/// Resolves a store item's taxonomy category name to a Modelibr category id for the item's
/// import target, creating a root-level category on first use. This implements the
/// find-or-create-BY-NAME integration contract stated in the store's docs/taxonomy.json:
/// category names are shared vocabulary, ids are per-instance.
/// Resolution is best-effort - a name that cannot be found or created resolves to null so
/// the item still imports, just uncategorized. Categories are an organizational enhancement
/// and must never fail an import.
/// </summary>
public interface IStoreImportCategoryResolver
{
    Task<int?> ResolveAsync(StoreManifestMapping.ImportTarget target, string? categoryName, CancellationToken ct);
}
