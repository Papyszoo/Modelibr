using System.Text.Json;
using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Models;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Materials;

public record CreateMaterialCommand(
    string Name,
    MaterialParametersRequest? Parameters = null,
    string? Description = null,
    int? CategoryId = null,
    string? PreviewGeometryType = null,
    IReadOnlyCollection<string>? Tags = null,
    JsonElement? Effects = null) : ICommand<CreateMaterialResponse>;

public record CreateMaterialResponse(int Id, string Name);

internal sealed class CreateMaterialCommandHandler : ICommandHandler<CreateMaterialCommand, CreateMaterialResponse>
{
    private readonly IMaterialRepository _materialRepository;
    private readonly ITextureSetCategoryRepository _categoryRepository;
    private readonly IModelTagRepository _modelTagRepository;
    private readonly ISettingRepository _settingRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public CreateMaterialCommandHandler(
        IMaterialRepository materialRepository,
        ITextureSetCategoryRepository categoryRepository,
        IModelTagRepository modelTagRepository,
        ISettingRepository settingRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _materialRepository = materialRepository;
        _categoryRepository = categoryRepository;
        _modelTagRepository = modelTagRepository;
        _settingRepository = settingRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<CreateMaterialResponse>> Handle(CreateMaterialCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var nameResult = await AssetNameService.ResolveNameAsync(
                command.Name, "Material",
                _materialRepository.ExistsByNameAsync,
                _materialRepository.GetNamesByPrefixAsync,
                _settingRepository, cancellationToken);
            if (nameResult.IsFailure)
            {
                return Result.Failure<CreateMaterialResponse>(
                    new Error("MaterialAlreadyExists", $"A material with the name '{command.Name}' already exists."));
            }

            var categoryResult = await ValidateCategoryAsync(command.CategoryId, cancellationToken);
            if (categoryResult.IsFailure)
                return Result.Failure<CreateMaterialResponse>(categoryResult.Error);

            // Validate the whole effects document before anything is created: a rejected
            // document must not leave a half-made material behind.
            var effects = MaterialEffectsDefinition.Read(command.Effects);
            if (effects.Problems.Count > 0)
                return Result.Failure<CreateMaterialResponse>(MaterialEffects.InvalidError(effects.Problems));

            var parameters = (command.Parameters ?? new MaterialParametersRequest())
                .ApplyTo(MaterialParameters.Default);

            var material = Material.Create(
                nameResult.Value,
                parameters,
                _dateTimeProvider.UtcNow,
                command.Description,
                command.CategoryId,
                command.PreviewGeometryType);

            if (effects.Definition is { } effectsJson)
                material.SetEffects(MaterialEffectsDefinition.Serialize(effectsJson), _dateTimeProvider.UtcNow);

            if (command.Tags is { Count: > 0 })
            {
                var tags = await MaterialTags.ResolveAsync(
                    _modelTagRepository, command.Tags, _dateTimeProvider.UtcNow, cancellationToken);
                material.SetTags(tags, _dateTimeProvider.UtcNow);
            }

            var saved = await _materialRepository.AddAsync(material, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);

            return Result.Success(new CreateMaterialResponse(saved.Id, saved.Name));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<CreateMaterialResponse>(new Error("MaterialCreationFailed", ex.Message));
        }
    }

    /// <summary>
    /// Materials share the Universal category vocabulary with global materials.
    /// A ModelSpecific category belongs to a model's own baked textures and would
    /// put the material in a grid it can never be browsed from.
    /// </summary>
    private async Task<Result> ValidateCategoryAsync(int? categoryId, CancellationToken cancellationToken)
    {
        if (!categoryId.HasValue)
            return Result.Success();

        var category = await _categoryRepository.GetByIdAsync(categoryId.Value, cancellationToken);
        if (category is null)
        {
            return Result.Failure(
                new Error("CategoryNotFound", $"Material category with ID {categoryId.Value} was not found."));
        }

        if (category.Kind != TextureSetKind.Universal)
        {
            return Result.Failure(new Error(
                "CategoryKindMismatch",
                $"Category '{category.Name}' belongs to the {category.Kind} vocabulary. Materials use the shared Universal one."));
        }

        return Result.Success();
    }
}
