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
/// Lookup is root-level and case-insensitive so an import never duplicates a category the
/// user already has as e.g. "music" vs the store's "Music". Results (including failures)
/// are cached per import scope, so one pack with 3,000 categorized items costs one
/// find-or-create per distinct (type, name) pair.
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

    private readonly Dictionary<(StoreManifestMapping.ImportTarget Target, string Name), int?> _cache =
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
    {
        var name = categoryName?.Trim();
        if (string.IsNullOrEmpty(name) || target == StoreManifestMapping.ImportTarget.Unsupported)
            return null;

        var key = (target, name.ToLowerInvariant());
        if (_cache.TryGetValue(key, out var cached))
            return cached;

        int? resolved;
        try
        {
            resolved = await FindOrCreateAsync(target, name, ct);
        }
        catch (Exception ex)
        {
            // Domain validation throws (e.g. name over the 100-char cap) instead of
            // returning a failure Result; either way the item must import uncategorized.
            _logger.LogWarning(ex, "Store import: could not resolve {Target} category '{Name}'; importing uncategorized", target, name);
            resolved = null;
        }

        _cache[key] = resolved;
        return resolved;
    }

    private async Task<int?> FindOrCreateAsync(
        StoreManifestMapping.ImportTarget target, string name, CancellationToken ct)
    {
        switch (target)
        {
            case StoreManifestMapping.ImportTarget.Model:
            {
                var all = await _getModelCategories.Handle(new GetAllModelCategoriesQuery(), ct);
                var found = FindRoot(all.Value.Categories, name, c => c.Name, c => c.ParentId, c => c.Id);
                if (found is not null)
                    return found;
                var created = await _createModelCategory.Handle(new CreateModelCategoryCommand(name, null, null), ct);
                return created.IsSuccess ? created.Value.Id : Warn(target, name, created.Error.Message);
            }
            case StoreManifestMapping.ImportTarget.TextureSet:
            {
                // Store imports create texture sets as ModelSpecific (see StoreImportSink),
                // so their categories live in the ModelSpecific vocabulary too.
                var all = await _getTextureSetCategories.Handle(new GetAllTextureSetCategoriesQuery(TextureSetKind.ModelSpecific), ct);
                var found = FindRoot(all.Value.Categories, name, c => c.Name, c => c.ParentId, c => c.Id);
                if (found is not null)
                    return found;
                var created = await _createTextureSetCategory.Handle(
                    new CreateTextureSetCategoryCommand(name, null, null, TextureSetKind.ModelSpecific), ct);
                return created.IsSuccess ? created.Value.Id : Warn(target, name, created.Error.Message);
            }
            case StoreManifestMapping.ImportTarget.Sound:
            {
                var all = await _getSoundCategories.Handle(new GetAllSoundCategoriesQuery(), ct);
                var found = FindRoot(all.Value.Categories, name, c => c.Name, c => c.ParentId, c => c.Id);
                if (found is not null)
                    return found;
                var created = await _createSoundCategory.Handle(new CreateSoundCategoryCommand(name), ct);
                return created.IsSuccess ? created.Value.Id : Warn(target, name, created.Error.Message);
            }
            case StoreManifestMapping.ImportTarget.Sprite:
            {
                var all = await _getSpriteCategories.Handle(new GetAllSpriteCategoriesQuery(), ct);
                var found = FindRoot(all.Value.Categories, name, c => c.Name, c => c.ParentId, c => c.Id);
                if (found is not null)
                    return found;
                var created = await _createSpriteCategory.Handle(new CreateSpriteCategoryCommand(name), ct);
                return created.IsSuccess ? created.Value.Id : Warn(target, name, created.Error.Message);
            }
            case StoreManifestMapping.ImportTarget.EnvironmentMap:
            {
                var all = await _getEnvironmentMapCategories.Handle(new GetAllEnvironmentMapCategoriesQuery(), ct);
                var found = FindRoot(all.Value.Categories, name, c => c.Name, c => c.ParentId, c => c.Id);
                if (found is not null)
                    return found;
                var created = await _createEnvironmentMapCategory.Handle(new CreateEnvironmentMapCategoryCommand(name, null, null), ct);
                return created.IsSuccess ? created.Value.Id : Warn(target, name, created.Error.Message);
            }
            default:
                return null;
        }
    }

    private static int? FindRoot<T>(
        IReadOnlyList<T> categories, string name,
        Func<T, string> getName, Func<T, int?> getParentId, Func<T, int> getId)
    {
        foreach (var category in categories)
        {
            if (getParentId(category) is null
                && string.Equals(getName(category), name, StringComparison.OrdinalIgnoreCase))
            {
                return getId(category);
            }
        }
        return null;
    }

    private int? Warn(StoreManifestMapping.ImportTarget target, string name, string error)
    {
        _logger.LogWarning("Store import: creating {Target} category '{Name}' failed ({Error}); importing uncategorized", target, name, error);
        return null;
    }
}
