using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Application.EnvironmentMaps;
using Application.Materials;
using Application.Models;
using Application.Sounds;
using Application.Sprites;
using Application.TextureSets;
using SharedKernel;

namespace Application.Metadata;

/// <summary>
/// The half of the metadata schema that lives on the asset's own entity - name, description,
/// tags and category - reached through one family-agnostic port.
///
/// <para>
/// It exists because those four fields are spread over six aggregates with six different
/// update commands, and the schema's whole point is that a caller names a field, not a
/// family's command. Writes are <b>delegated to the family's existing command</b> rather than
/// staged against repositories directly: those commands mirror the change onto the search
/// projection in the same transaction, and a metadata write that skipped them would leave
/// search describing an asset that no longer matches it.
/// </para>
/// </summary>
public interface IAssetEntityMetadata
{
    /// <summary>What the family's entity currently holds, or a failure when the asset does not exist.</summary>
    Task<Result<AssetEntityMetadataState>> ReadAsync(string family, int assetId, CancellationToken cancellationToken);

    /// <summary>Applies only the fields the write marks as set.</summary>
    Task<Result> WriteAsync(string family, int assetId, AssetEntityMetadataWrite write, CancellationToken cancellationToken);
}

public sealed record AssetEntityMetadataState(
    string Name,
    string? Description,
    IReadOnlyList<string> Tags,
    int? CategoryId,
    string? CategoryName);

/// <summary>
/// A patch. Each <c>Set*</c> flag distinguishes "leave this alone" from "set it to null",
/// which a nullable value alone cannot - and the difference matters, because a population
/// pass that only knows an asset's licence must not blank the description someone wrote.
/// </summary>
public sealed record AssetEntityMetadataWrite(
    bool SetDescription = false,
    string? Description = null,
    bool SetTags = false,
    IReadOnlyList<string>? Tags = null,
    bool SetCategory = false,
    int? CategoryId = null)
{
    public bool IsEmpty => !SetDescription && !SetTags && !SetCategory;
}

internal sealed class AssetEntityMetadataGateway : IAssetEntityMetadata
{
    private readonly IModelRepository _models;
    private readonly ITextureSetRepository _textureSets;
    private readonly IMaterialRepository _materials;
    private readonly IEnvironmentMapRepository _environmentMaps;
    private readonly ISoundRepository _sounds;
    private readonly ISpriteRepository _sprites;

    private readonly IModelCategoryRepository _modelCategories;
    private readonly ITextureSetCategoryRepository _textureSetCategories;
    private readonly ISoundCategoryRepository _soundCategories;
    private readonly ISpriteCategoryRepository _spriteCategories;
    private readonly IEnvironmentMapCategoryRepository _environmentMapCategories;

    private readonly ICommandHandler<UpdateModelTagsCommand, UpdateModelTagsResponse> _updateModel;
    private readonly ICommandHandler<UpdateTextureSetTagsCommand, UpdateTextureSetTagsResponse> _updateTextureSetTags;
    private readonly ICommandHandler<UpdateTextureSetCommand, UpdateTextureSetResponse> _updateTextureSet;
    private readonly ICommandHandler<UpdateMaterialTagsCommand, UpdateMaterialTagsResponse> _updateMaterialTags;
    private readonly ICommandHandler<UpdateMaterialCommand, MaterialDto> _updateMaterial;
    private readonly ICommandHandler<UpdateEnvironmentMapMetadataCommand, UpdateEnvironmentMapMetadataResponse> _updateEnvironmentMap;
    private readonly ICommandHandler<UpdateSoundCommand, UpdateSoundResponse> _updateSound;
    private readonly ICommandHandler<UpdateSpriteCommand, UpdateSpriteResponse> _updateSprite;
    private readonly ICommandHandler<UpdateSoundMetadataCommand, UpdateSoundMetadataResponse> _updateSoundMetadata;
    private readonly ICommandHandler<UpdateSpriteMetadataCommand, UpdateSpriteMetadataResponse> _updateSpriteMetadata;

    public AssetEntityMetadataGateway(
        IModelRepository models,
        ITextureSetRepository textureSets,
        IMaterialRepository materials,
        IEnvironmentMapRepository environmentMaps,
        ISoundRepository sounds,
        ISpriteRepository sprites,
        IModelCategoryRepository modelCategories,
        ITextureSetCategoryRepository textureSetCategories,
        ISoundCategoryRepository soundCategories,
        ISpriteCategoryRepository spriteCategories,
        IEnvironmentMapCategoryRepository environmentMapCategories,
        ICommandHandler<UpdateModelTagsCommand, UpdateModelTagsResponse> updateModel,
        ICommandHandler<UpdateTextureSetTagsCommand, UpdateTextureSetTagsResponse> updateTextureSetTags,
        ICommandHandler<UpdateTextureSetCommand, UpdateTextureSetResponse> updateTextureSet,
        ICommandHandler<UpdateMaterialTagsCommand, UpdateMaterialTagsResponse> updateMaterialTags,
        ICommandHandler<UpdateMaterialCommand, MaterialDto> updateMaterial,
        ICommandHandler<UpdateEnvironmentMapMetadataCommand, UpdateEnvironmentMapMetadataResponse> updateEnvironmentMap,
        ICommandHandler<UpdateSoundCommand, UpdateSoundResponse> updateSound,
        ICommandHandler<UpdateSpriteCommand, UpdateSpriteResponse> updateSprite,
        ICommandHandler<UpdateSoundMetadataCommand, UpdateSoundMetadataResponse> updateSoundMetadata,
        ICommandHandler<UpdateSpriteMetadataCommand, UpdateSpriteMetadataResponse> updateSpriteMetadata)
    {
        _models = models;
        _textureSets = textureSets;
        _materials = materials;
        _environmentMaps = environmentMaps;
        _sounds = sounds;
        _sprites = sprites;
        _modelCategories = modelCategories;
        _textureSetCategories = textureSetCategories;
        _soundCategories = soundCategories;
        _spriteCategories = spriteCategories;
        _environmentMapCategories = environmentMapCategories;
        _updateModel = updateModel;
        _updateTextureSetTags = updateTextureSetTags;
        _updateTextureSet = updateTextureSet;
        _updateMaterialTags = updateMaterialTags;
        _updateMaterial = updateMaterial;
        _updateEnvironmentMap = updateEnvironmentMap;
        _updateSound = updateSound;
        _updateSprite = updateSprite;
        _updateSoundMetadata = updateSoundMetadata;
        _updateSpriteMetadata = updateSpriteMetadata;
    }

    public async Task<Result<AssetEntityMetadataState>> ReadAsync(
        string family, int assetId, CancellationToken cancellationToken)
    {
        switch (family)
        {
            case AssetMetadataSchema.Families.Model:
            {
                var model = await _models.GetByIdAsync(assetId, cancellationToken);
                if (model is null) return NotFound(family, assetId);
                return Result.Success(new AssetEntityMetadataState(
                    model.Name,
                    model.Description,
                    TagNames(model.Tags.Select(t => t.Name)),
                    model.ModelCategoryId,
                    await CategoryNameAsync(_modelCategories, model.ModelCategoryId, cancellationToken)));
            }

            case AssetMetadataSchema.Families.TextureSet:
            {
                var set = await _textureSets.GetByIdAsync(assetId, cancellationToken);
                if (set is null) return NotFound(family, assetId);
                return Result.Success(new AssetEntityMetadataState(
                    set.Name,
                    // No Description column on TextureSet - the side table holds it, which is
                    // what the schema's storage pointer says.
                    null,
                    TagNames(set.Tags.Select(t => t.Name)),
                    set.TextureSetCategoryId,
                    await CategoryNameAsync(_textureSetCategories, set.TextureSetCategoryId, cancellationToken)));
            }

            case AssetMetadataSchema.Families.Material:
            {
                var material = await _materials.GetByIdAsync(assetId, cancellationToken);
                if (material is null) return NotFound(family, assetId);
                return Result.Success(new AssetEntityMetadataState(
                    material.Name,
                    material.Description,
                    TagNames(material.Tags.Select(t => t.Name)),
                    material.CategoryId,
                    // A Material's category comes from the TextureSet tree (the Universal kind).
                    await CategoryNameAsync(_textureSetCategories, material.CategoryId, cancellationToken)));
            }

            case AssetMetadataSchema.Families.EnvironmentMap:
            {
                var map = await _environmentMaps.GetByIdAsync(assetId, cancellationToken);
                if (map is null) return NotFound(family, assetId);
                return Result.Success(new AssetEntityMetadataState(
                    map.Name,
                    null,
                    TagNames(map.Tags.Select(t => t.Name)),
                    map.EnvironmentMapCategoryId,
                    await CategoryNameAsync(_environmentMapCategories, map.EnvironmentMapCategoryId, cancellationToken)));
            }

            case AssetMetadataSchema.Families.Sound:
            {
                var sound = await _sounds.GetByIdAsync(assetId, cancellationToken);
                if (sound is null) return NotFound(family, assetId);
                return Result.Success(new AssetEntityMetadataState(
                    sound.Name,
                    sound.Description,
                    TagNames(sound.Tags.Select(t => t.Name)),
                    sound.SoundCategoryId,
                    await CategoryNameAsync(_soundCategories, sound.SoundCategoryId, cancellationToken)));
            }

            case AssetMetadataSchema.Families.Sprite:
            {
                var sprite = await _sprites.GetByIdAsync(assetId, cancellationToken);
                if (sprite is null) return NotFound(family, assetId);
                return Result.Success(new AssetEntityMetadataState(
                    sprite.Name,
                    sprite.Description,
                    TagNames(sprite.Tags.Select(t => t.Name)),
                    sprite.SpriteCategoryId,
                    await CategoryNameAsync(_spriteCategories, sprite.SpriteCategoryId, cancellationToken)));
            }

            default:
                return Result.Failure<AssetEntityMetadataState>(
                    new Error("UnknownAssetFamily", $"'{family}' is not an asset family this schema covers."));
        }
    }

    public async Task<Result> WriteAsync(
        string family, int assetId, AssetEntityMetadataWrite write, CancellationToken cancellationToken)
    {
        if (write.IsEmpty)
        {
            return Result.Success();
        }

        var currentResult = await ReadAsync(family, assetId, cancellationToken);
        if (currentResult.IsFailure)
        {
            return Result.Failure(currentResult.Error);
        }

        var current = currentResult.Value;
        var description = write.SetDescription ? write.Description : current.Description;
        var tags = write.SetTags ? write.Tags ?? Array.Empty<string>() : current.Tags;
        var categoryId = write.SetCategory ? write.CategoryId : current.CategoryId;

        switch (family)
        {
            case AssetMetadataSchema.Families.Model:
            {
                // One command carries all three, so the untouched two are re-sent as they
                // are. That is also what makes the write undoable - the values it replaced
                // are the only record of what was there.
                var result = await _updateModel.Handle(
                    new UpdateModelTagsCommand(assetId, tags, description, categoryId), cancellationToken);
                return result.IsFailure ? Result.Failure(result.Error) : Result.Success();
            }

            case AssetMetadataSchema.Families.TextureSet:
            {
                if (write.SetTags)
                {
                    var tagResult = await _updateTextureSetTags.Handle(
                        new UpdateTextureSetTagsCommand(assetId, tags), cancellationToken);
                    if (tagResult.IsFailure) return Result.Failure(tagResult.Error);
                }

                if (write.SetCategory)
                {
                    // The command's Name is required, so the current name goes back in
                    // unchanged; this is a category write, not a rename.
                    var result = await _updateTextureSet.Handle(
                        new UpdateTextureSetCommand(assetId, current.Name, categoryId), cancellationToken);
                    if (result.IsFailure) return Result.Failure(result.Error);
                }

                return Result.Success();
            }

            case AssetMetadataSchema.Families.Material:
            {
                if (write.SetTags)
                {
                    var tagResult = await _updateMaterialTags.Handle(
                        new UpdateMaterialTagsCommand(assetId, tags), cancellationToken);
                    if (tagResult.IsFailure) return Result.Failure(tagResult.Error);
                }

                if (write.SetDescription || write.SetCategory)
                {
                    var result = await _updateMaterial.Handle(
                        new UpdateMaterialCommand(
                            assetId,
                            Description: description,
                            CategoryId: categoryId,
                            // Clearing is explicit on this command: a null CategoryId alone
                            // means "unchanged", so a caller that asked to clear has to say
                            // so or the clear silently does nothing.
                            ClearCategory: write.SetCategory && categoryId is null),
                        cancellationToken);
                    if (result.IsFailure) return Result.Failure(result.Error);
                }

                return Result.Success();
            }

            case AssetMetadataSchema.Families.EnvironmentMap:
            {
                var result = await _updateEnvironmentMap.Handle(
                    new UpdateEnvironmentMapMetadataCommand(assetId, tags, categoryId), cancellationToken);
                return result.IsFailure ? Result.Failure(result.Error) : Result.Success();
            }

            case AssetMetadataSchema.Families.Sound:
            {
                if (write.SetTags || write.SetDescription)
                {
                    var metadataResult = await _updateSoundMetadata.Handle(
                        new UpdateSoundMetadataCommand(assetId, tags, description), cancellationToken);
                    if (metadataResult.IsFailure) return Result.Failure(metadataResult.Error);
                }

                if (write.SetCategory)
                {
                    var result = await _updateSound.Handle(
                        new UpdateSoundCommand(assetId, null, categoryId), cancellationToken);
                    if (result.IsFailure) return Result.Failure(result.Error);
                }

                return Result.Success();
            }

            case AssetMetadataSchema.Families.Sprite:
            {
                if (write.SetTags || write.SetDescription)
                {
                    var metadataResult = await _updateSpriteMetadata.Handle(
                        new UpdateSpriteMetadataCommand(assetId, tags, description), cancellationToken);
                    if (metadataResult.IsFailure) return Result.Failure(metadataResult.Error);
                }

                if (write.SetCategory)
                {
                    // SpriteType null means "unchanged" on this command; this is a category
                    // write, not a retyping.
                    var result = await _updateSprite.Handle(
                        new UpdateSpriteCommand(assetId, null, null, categoryId), cancellationToken);
                    if (result.IsFailure) return Result.Failure(result.Error);
                }

                return Result.Success();
            }

            default:
                return Result.Failure(
                    new Error("UnknownAssetFamily", $"'{family}' is not an asset family this schema covers."));
        }
    }

    private static Result<AssetEntityMetadataState> NotFound(string family, int assetId)
        => Result.Failure<AssetEntityMetadataState>(
            new Error("AssetNotFound", $"{family} with ID {assetId} was not found."));

    private static IReadOnlyList<string> TagNames(IEnumerable<string> names)
        => names.Where(n => !string.IsNullOrWhiteSpace(n)).OrderBy(n => n, StringComparer.Ordinal).ToList();

    private static async Task<string?> CategoryNameAsync<TCategory>(
        IHierarchicalCategoryRepository<TCategory> repository,
        int? categoryId,
        CancellationToken cancellationToken)
        where TCategory : class, IHierarchicalCategory<TCategory>
    {
        if (categoryId is null) return null;
        var category = await repository.GetByIdAsync(categoryId.Value, cancellationToken);
        return category?.Name;
    }
}
