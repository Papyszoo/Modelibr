using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Materials;

/// <summary>
/// A patch: every field is optional and an omitted one is left alone. Only
/// <c>CategoryId</c> needs a way to say "clear it", hence <c>ClearCategory</c> -
/// a null id alone cannot be told apart from "not mentioned".
/// </summary>
public record UpdateMaterialCommand(
    int Id,
    string? Name = null,
    string? Description = null,
    MaterialParametersRequest? Parameters = null,
    int? CategoryId = null,
    bool ClearCategory = false,
    string? PreviewGeometryType = null) : ICommand<MaterialDto>;

internal sealed class UpdateMaterialCommandHandler : ICommandHandler<UpdateMaterialCommand, MaterialDto>
{
    private readonly IMaterialRepository _materialRepository;
    private readonly ITextureSetCategoryRepository _categoryRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateMaterialCommandHandler(
        IMaterialRepository materialRepository,
        ITextureSetCategoryRepository categoryRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _materialRepository = materialRepository;
        _categoryRepository = categoryRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<MaterialDto>> Handle(UpdateMaterialCommand command, CancellationToken cancellationToken)
    {
        var material = await _materialRepository.GetByIdAsync(command.Id, cancellationToken);
        if (material is null)
        {
            return Result.Failure<MaterialDto>(
                new Error("MaterialNotFound", $"Material with ID {command.Id} was not found."));
        }

        var now = _dateTimeProvider.UtcNow;

        try
        {
            if (!string.IsNullOrWhiteSpace(command.Name))
                material.UpdateName(command.Name, now);

            if (command.Description is not null)
                material.UpdateDescription(command.Description, now);

            if (command.Parameters is not null)
                material.UpdateParameters(command.Parameters.ApplyTo(material.Parameters), now);

            if (command.PreviewGeometryType is not null)
                material.UpdatePreviewGeometryType(command.PreviewGeometryType, now);

            if (command.ClearCategory)
            {
                material.UpdateCategory(null, now);
            }
            else if (command.CategoryId.HasValue)
            {
                var category = await _categoryRepository.GetByIdAsync(command.CategoryId.Value, cancellationToken);
                if (category is null)
                {
                    return Result.Failure<MaterialDto>(
                        new Error("CategoryNotFound", $"Material category with ID {command.CategoryId.Value} was not found."));
                }

                if (category.Kind != TextureSetKind.Universal)
                {
                    return Result.Failure<MaterialDto>(new Error(
                        "CategoryKindMismatch",
                        $"Category '{category.Name}' belongs to the {category.Kind} vocabulary. Materials use the shared Universal one."));
                }

                material.UpdateCategory(command.CategoryId.Value, now);
            }
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<MaterialDto>(new Error("MaterialUpdateFailed", ex.Message));
        }

        await _materialRepository.UpdateAsync(material, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(MaterialDto.From(material));
    }
}
