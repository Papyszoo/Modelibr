using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Extraction;
using Domain.Services;
using SharedKernel;

namespace Application.Models;

/// <summary>
/// Assigns (or clears, with null) a model's category without touching its tags or
/// description — distinct from <see cref="UpdateModelTagsCommand"/>, which rewrites all
/// three together. Used by the MCP <c>set_category</c> write tool and category-only edits.
/// </summary>
internal sealed class SetModelCategoryCommandHandler
    : ICommandHandler<SetModelCategoryCommand, SetModelCategoryResponse>
{
    private readonly IModelRepository _modelRepository;
    private readonly IModelCategoryRepository _modelCategoryRepository;
    private readonly IAssetSearchDocumentRepository _searchDocumentRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public SetModelCategoryCommandHandler(
        IModelRepository modelRepository,
        IModelCategoryRepository modelCategoryRepository,
        IAssetSearchDocumentRepository searchDocumentRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _modelRepository = modelRepository;
        _modelCategoryRepository = modelCategoryRepository;
        _searchDocumentRepository = searchDocumentRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<SetModelCategoryResponse>> Handle(
        SetModelCategoryCommand command,
        CancellationToken cancellationToken)
    {
        var model = await _modelRepository.GetByIdAsync(command.ModelId, cancellationToken);
        if (model is null)
        {
            return Result.Failure<SetModelCategoryResponse>(
                new Error("ModelNotFound", $"Model with ID {command.ModelId} was not found."));
        }

        string? categoryName = null;
        if (command.CategoryId.HasValue)
        {
            var category = await _modelCategoryRepository.GetByIdAsync(command.CategoryId.Value, cancellationToken);
            if (category is null)
            {
                return Result.Failure<SetModelCategoryResponse>(
                    new Error("CategoryNotFound", $"Model category with ID {command.CategoryId.Value} was not found."));
            }
            categoryName = category.Name;
        }

        model.AssignCategory(command.CategoryId, _dateTimeProvider.UtcNow);
        await _modelRepository.UpdateAsync(model, cancellationToken);

        // Category is denormalised into the search projection during extraction, so a
        // category-only write has to re-point it here as well — otherwise an agent that
        // calls set_category cannot confirm its own write with a category-filtered
        // search until something happens to re-derive the asset.
        await _searchDocumentRepository.SetCategoryForAssetAsync(
            ExtractionAssetTypes.Model, model.Id, command.CategoryId, categoryName, cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(new SetModelCategoryResponse(model.Id, model.ModelCategoryId));
    }
}

public record SetModelCategoryCommand(int ModelId, int? CategoryId) : ICommand<SetModelCategoryResponse>;

public record SetModelCategoryResponse(int ModelId, int? CategoryId);
