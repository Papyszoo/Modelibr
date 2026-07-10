using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Models;
using Domain.Services;
using SharedKernel;

namespace Application.TextureSets;

internal class UpdateTextureSetCommandHandler : ICommandHandler<UpdateTextureSetCommand, UpdateTextureSetResponse>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly ITextureSetCategoryRepository _textureSetCategoryRepository;
    private readonly ISettingRepository _settingRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateTextureSetCommandHandler(
        ITextureSetRepository textureSetRepository,
        ITextureSetCategoryRepository textureSetCategoryRepository,
        ISettingRepository settingRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _textureSetRepository = textureSetRepository;
        _textureSetCategoryRepository = textureSetCategoryRepository;
        _settingRepository = settingRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<UpdateTextureSetResponse>> Handle(UpdateTextureSetCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var textureSet = await _textureSetRepository.GetByIdAsync(command.Id, cancellationToken);
            if (textureSet == null)
            {
                return Result.Failure<UpdateTextureSetResponse>(
                    new Error("TextureSetNotFound", $"Texture set with ID {command.Id} was not found."));
            }

            // Renames follow the same DuplicateNamePolicy as creation: Allow keeps the
            // name as-is, Reject fails, AutoRename appends a numeric suffix. Only checked
            // when the name actually changed, and the existence check excludes this
            // texture set itself so it can keep or re-case its own name without tripping
            // the Reject policy.
            var resolvedName = command.Name;
            if (command.Name != textureSet.Name)
            {
                var nameResult = await AssetNameService.ResolveNameAsync(
                    command.Name, "TextureSet",
                    async (name, ct) =>
                    {
                        var other = await _textureSetRepository.GetByNameAsync(name, ct);
                        return other != null && other.Id != command.Id;
                    },
                    _textureSetRepository.GetNamesByPrefixAsync,
                    _settingRepository, cancellationToken);
                if (nameResult.IsFailure)
                {
                    return Result.Failure<UpdateTextureSetResponse>(
                        new Error("TextureSetNameAlreadyExists", $"A texture set with the name '{command.Name}' already exists."));
                }

                resolvedName = nameResult.Value;
            }

            if (command.CategoryId.HasValue)
            {
                var category = await _textureSetCategoryRepository.GetByIdAsync(command.CategoryId.Value, cancellationToken);
                if (category == null)
                {
                    return Result.Failure<UpdateTextureSetResponse>(
                        new Error("CategoryNotFound", $"Texture set category with ID {command.CategoryId.Value} was not found."));
                }

                if (category.Kind != textureSet.Kind)
                {
                    return Result.Failure<UpdateTextureSetResponse>(
                        new Error("CategoryKindMismatch", "The category belongs to a different texture set kind."));
                }
            }

            // Update the texture set name
            textureSet.UpdateName(resolvedName, _dateTimeProvider.UtcNow);
            textureSet.AssignCategory(command.CategoryId, _dateTimeProvider.UtcNow);

            var updatedTextureSet = await _textureSetRepository.UpdateAsync(textureSet, cancellationToken);

            return Result.Success(new UpdateTextureSetResponse(updatedTextureSet.Id, updatedTextureSet.Name, updatedTextureSet.TextureSetCategoryId));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<UpdateTextureSetResponse>(
                new Error("TextureSetUpdateFailed", ex.Message));
        }
    }
}

public record UpdateTextureSetCommand(int Id, string Name, int? CategoryId) : ICommand<UpdateTextureSetResponse>;
public record UpdateTextureSetResponse(int Id, string Name, int? CategoryId);
