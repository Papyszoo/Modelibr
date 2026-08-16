using Application.Abstractions.Messaging;
using Application.EnvironmentMapCategories;
using Application.ModelCategories;
using Application.Models;
using Application.SoundCategories;
using Application.SpriteCategories;
using Application.TextureSetCategories;
using Domain.ValueObjects;
using Microsoft.Extensions.Logging;

namespace Application.StoreImports;

/// <summary>
/// Find-or-create category resolution over the same per-asset-type handlers the UI uses
/// (no parallel persistence path - mirrors the <see cref="StoreImportSink"/> philosophy).
/// Lookup is case-insensitive so an import never duplicates a category the
/// user already has as e.g. "music" vs the store's "Music". When a subcategory is provided,
/// the resolver finds or creates the root category first, then finds or creates the child
/// category with ParentId set to the root category. One list read covers both lookups: the
/// category queries return every category flat, so an existing root's children are already
/// in hand, and a root that was just created cannot have any. Results (including failures)
/// are cached per import scope, so one pack with 3,000 categorized items costs one
/// find-or-create per distinct (type, category, subcategory) tuple.
/// </summary>
internal sealed class StoreImportCategoryResolver : IStoreImportCategoryResolver
{
    private readonly IQueryHandler<GetAllModelCategoriesQuery, GetAllModelCategoriesResponse> _getModelCategories;
    private readonly IQueryHandler<GetAllTextureSetCategoriesQuery, GetAllTextureSetCategoriesResponse> _getTextureSetCategories;
    private readonly IQueryHandler<GetAllSoundCategoriesQuery, GetAllSoundCategoriesResponse> _getSoundCategories;
    private readonly IQueryHandler<GetAllSpriteCategoriesQuery, GetAllSpriteCategoriesResponse> _getSpriteCategories;
    private readonly IQueryHandler<GetAllEnvironmentMapCategoriesQuery, GetAllEnvironmentMapCategoriesResponse> _getEnvironmentMapCategories;
    private readonly ICommandHandler<CreateModelCategoryCommand, ModelCategorySummaryDto> _createModelCategory;
    private readonly ICommandHandler<CreateTextureSetCategoryCommand, TextureSetCategorySummaryDto> _createTextureSetCategory;
    private readonly ICommandHandler<CreateSoundCategoryCommand, SoundCategorySummaryDto> _createSoundCategory;
    private readonly ICommandHandler<CreateSpriteCategoryCommand, SpriteCategorySummaryDto> _createSpriteCategory;
    private readonly ICommandHandler<CreateEnvironmentMapCategoryCommand, EnvironmentMapCategorySummaryDto> _createEnvironmentMapCategory;
    private readonly ILogger<StoreImportCategoryResolver> _logger;

    private readonly Dictionary<(StoreManifestMapping.ImportTarget Target, string Category, string? Subcategory), int?> _cache =
        new();

    public StoreImportCategoryResolver(
        IQueryHandler<GetAllModelCategoriesQuery, GetAllModelCategoriesResponse> getModelCategories,
        IQueryHandler<GetAllTextureSetCategoriesQuery, GetAllTextureSetCategoriesResponse> getTextureSetCategories,
        IQueryHandler<GetAllSoundCategoriesQuery, GetAllSoundCategoriesResponse> getSoundCategories,
        IQueryHandler<GetAllSpriteCategoriesQuery, GetAllSpriteCategoriesResponse> getSpriteCategories,
        IQueryHandler<GetAllEnvironmentMapCategoriesQuery, GetAllEnvironmentMapCategoriesResponse> getEnvironmentMapCategories,
        ICommandHandler<CreateModelCategoryCommand, ModelCategorySummaryDto> createModelCategory,
        ICommandHandler<CreateTextureSetCategoryCommand, TextureSetCategorySummaryDto> createTextureSetCategory,
        ICommandHandler<CreateSoundCategoryCommand, SoundCategorySummaryDto> createSoundCategory,
        ICommandHandler<CreateSpriteCategoryCommand, SpriteCategorySummaryDto> createSpriteCategory,
        ICommandHandler<CreateEnvironmentMapCategoryCommand, EnvironmentMapCategorySummaryDto> createEnvironmentMapCategory,
        ILogger<StoreImportCategoryResolver> logger)
    {
        _getModelCategories = getModelCategories;
        _getTextureSetCategories = getTextureSetCategories;
        _getSoundCategories = getSoundCategories;
        _getSpriteCategories = getSpriteCategories;
        _getEnvironmentMapCategories = getEnvironmentMapCategories;
        _createModelCategory = createModelCategory;
        _createTextureSetCategory = createTextureSetCategory;
        _createSoundCategory = createSoundCategory;
        _createSpriteCategory = createSpriteCategory;
        _createEnvironmentMapCategory = createEnvironmentMapCategory;
        _logger = logger;
    }

    public async Task<int?> ResolveAsync(
        StoreManifestMapping.ImportTarget target, string? categoryName, CancellationToken ct)
        => await ResolveAsync(target, categoryName, null, ct);

    public async Task<int?> ResolveAsync(
        StoreManifestMapping.ImportTarget target, string? categoryName, string? subcategoryName, CancellationToken ct)
    {
        var cat = categoryName?.Trim();
        if (string.IsNullOrEmpty(cat) || target == StoreManifestMapping.ImportTarget.Unsupported)
            return null;

        var sub = string.IsNullOrWhiteSpace(subcategoryName) ? null : subcategoryName.Trim();
        var key = (target, cat.ToLowerInvariant(), sub?.ToLowerInvariant());
        if (_cache.TryGetValue(key, out var cached))
            return cached;

        int? resolved;
        try
        {
            resolved = await FindOrCreateAsync(target, cat, sub, ct);
        }
        catch (Exception ex)
        {
            // Domain validation throws (e.g. name over the 100-char cap) instead of
            // returning a failure Result; either way the item must import uncategorized.
            _logger.LogWarning(ex, "Store import: could not resolve {Target} category '{Category}/{Subcategory}'; importing uncategorized", target, cat, sub);
            resolved = null;
        }

        _cache[key] = resolved;
        return resolved;
    }

    private async Task<int?> FindOrCreateAsync(
        StoreManifestMapping.ImportTarget target, string categoryName, string? subcategoryName, CancellationToken ct)
    {
        switch (target)
        {
            case StoreManifestMapping.ImportTarget.Model:
            {
                var all = await _getModelCategories.Handle(new GetAllModelCategoriesQuery(), ct);
                var rootId = FindCategory(all.Value.Categories, categoryName, null, c => c.Name, c => c.ParentId, c => c.Id);
                if (rootId is null)
                {
                    var created = await _createModelCategory.Handle(new CreateModelCategoryCommand(categoryName, null, null), ct);
                    if (!created.IsSuccess) return Warn(target, categoryName, created.Error.Message);
                    rootId = created.Value.Id;
                }

                if (string.IsNullOrEmpty(subcategoryName)) return rootId;

                var childId = FindCategory(all.Value.Categories, subcategoryName, rootId, c => c.Name, c => c.ParentId, c => c.Id);
                if (childId is not null) return childId;

                var childCreated = await _createModelCategory.Handle(new CreateModelCategoryCommand(subcategoryName, null, rootId), ct);
                if (childCreated.IsSuccess) return childCreated.Value.Id;
                return WarnChild(target, subcategoryName, childCreated.Error.Message, rootId);
            }
            case StoreManifestMapping.ImportTarget.TextureSet:
            {
                var all = await _getTextureSetCategories.Handle(new GetAllTextureSetCategoriesQuery(TextureSetKind.ModelSpecific), ct);
                var rootId = FindCategory(all.Value.Categories, categoryName, null, c => c.Name, c => c.ParentId, c => c.Id);
                if (rootId is null)
                {
                    var created = await _createTextureSetCategory.Handle(
                        new CreateTextureSetCategoryCommand(categoryName, null, null, TextureSetKind.ModelSpecific), ct);
                    if (!created.IsSuccess) return Warn(target, categoryName, created.Error.Message);
                    rootId = created.Value.Id;
                }

                if (string.IsNullOrEmpty(subcategoryName)) return rootId;

                var childId = FindCategory(all.Value.Categories, subcategoryName, rootId, c => c.Name, c => c.ParentId, c => c.Id);
                if (childId is not null) return childId;

                var childCreated = await _createTextureSetCategory.Handle(
                    new CreateTextureSetCategoryCommand(subcategoryName, null, rootId, TextureSetKind.ModelSpecific), ct);
                if (childCreated.IsSuccess) return childCreated.Value.Id;
                return WarnChild(target, subcategoryName, childCreated.Error.Message, rootId);
            }
            case StoreManifestMapping.ImportTarget.Sound:
            {
                var all = await _getSoundCategories.Handle(new GetAllSoundCategoriesQuery(), ct);
                var rootId = FindCategory(all.Value.Categories, categoryName, null, c => c.Name, c => c.ParentId, c => c.Id);
                if (rootId is null)
                {
                    var created = await _createSoundCategory.Handle(new CreateSoundCategoryCommand(categoryName, null, null), ct);
                    if (!created.IsSuccess) return Warn(target, categoryName, created.Error.Message);
                    rootId = created.Value.Id;
                }

                if (string.IsNullOrEmpty(subcategoryName)) return rootId;

                var childId = FindCategory(all.Value.Categories, subcategoryName, rootId, c => c.Name, c => c.ParentId, c => c.Id);
                if (childId is not null) return childId;

                var childCreated = await _createSoundCategory.Handle(new CreateSoundCategoryCommand(subcategoryName, null, rootId), ct);
                if (childCreated.IsSuccess) return childCreated.Value.Id;
                return WarnChild(target, subcategoryName, childCreated.Error.Message, rootId);
            }
            case StoreManifestMapping.ImportTarget.Sprite:
            {
                var all = await _getSpriteCategories.Handle(new GetAllSpriteCategoriesQuery(), ct);
                var rootId = FindCategory(all.Value.Categories, categoryName, null, c => c.Name, c => c.ParentId, c => c.Id);
                if (rootId is null)
                {
                    var created = await _createSpriteCategory.Handle(new CreateSpriteCategoryCommand(categoryName, null, null), ct);
                    if (!created.IsSuccess) return Warn(target, categoryName, created.Error.Message);
                    rootId = created.Value.Id;
                }

                if (string.IsNullOrEmpty(subcategoryName)) return rootId;

                var childId = FindCategory(all.Value.Categories, subcategoryName, rootId, c => c.Name, c => c.ParentId, c => c.Id);
                if (childId is not null) return childId;

                var childCreated = await _createSpriteCategory.Handle(new CreateSpriteCategoryCommand(subcategoryName, null, rootId), ct);
                if (childCreated.IsSuccess) return childCreated.Value.Id;
                return WarnChild(target, subcategoryName, childCreated.Error.Message, rootId);
            }
            case StoreManifestMapping.ImportTarget.EnvironmentMap:
            {
                var all = await _getEnvironmentMapCategories.Handle(new GetAllEnvironmentMapCategoriesQuery(), ct);
                var rootId = FindCategory(all.Value.Categories, categoryName, null, c => c.Name, c => c.ParentId, c => c.Id);
                if (rootId is null)
                {
                    var created = await _createEnvironmentMapCategory.Handle(new CreateEnvironmentMapCategoryCommand(categoryName, null, null), ct);
                    if (!created.IsSuccess) return Warn(target, categoryName, created.Error.Message);
                    rootId = created.Value.Id;
                }

                if (string.IsNullOrEmpty(subcategoryName)) return rootId;

                var childId = FindCategory(all.Value.Categories, subcategoryName, rootId, c => c.Name, c => c.ParentId, c => c.Id);
                if (childId is not null) return childId;

                var childCreated = await _createEnvironmentMapCategory.Handle(new CreateEnvironmentMapCategoryCommand(subcategoryName, null, rootId), ct);
                if (childCreated.IsSuccess) return childCreated.Value.Id;
                return WarnChild(target, subcategoryName, childCreated.Error.Message, rootId);
            }
            default:
                return null;
        }
    }

    private static int? FindCategory<T>(
        IReadOnlyList<T> categories, string name, int? parentId,
        Func<T, string> getName, Func<T, int?> getParentId, Func<T, int> getId)
    {
        foreach (var category in categories)
        {
            if (getParentId(category) == parentId
                && string.Equals(getName(category), name, StringComparison.OrdinalIgnoreCase))
            {
                return getId(category);
            }
        }
        return null;
    }

    /// <summary>
    /// Records a subcategory that could not be created, and falls back to its parent.
    ///
    /// Falling back is right - a sound filed under "Ambience" is more useful than one filed
    /// nowhere - but it has to be visible. Silently downgrading meant a subcategory that could
    /// never be created (a name over the 100-char cap, say) filed a whole import one level up
    /// with nothing in the log to explain it. Distinct from <see cref="Warn"/>, which reports
    /// the item landing uncategorized altogether.
    /// </summary>
    private int? WarnChild(
        StoreManifestMapping.ImportTarget target, string name, string error, int? parentId)
    {
        _logger.LogWarning(
            "Store import: creating {Target} subcategory '{Name}' failed ({Error}); filing under the parent category instead",
            target, name, error);
        return parentId;
    }

    private int? Warn(StoreManifestMapping.ImportTarget target, string name, string error)
    {
        _logger.LogWarning("Store import: creating {Target} category '{Name}' failed ({Error}); importing uncategorized", target, name, error);
        return null;
    }
}
