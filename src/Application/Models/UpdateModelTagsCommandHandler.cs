using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Extraction;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Models;

internal sealed class UpdateModelTagsCommandHandler 
    : ICommandHandler<UpdateModelTagsCommand, UpdateModelTagsResponse>
{
    private readonly IModelRepository _modelRepository;
    private readonly IModelTagRepository _modelTagRepository;
    private readonly IModelCategoryRepository _modelCategoryRepository;
    private readonly IAssetSearchDocumentRepository _searchDocumentRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateModelTagsCommandHandler(
        IModelRepository modelRepository,
        IModelTagRepository modelTagRepository,
        IModelCategoryRepository modelCategoryRepository,
        IAssetSearchDocumentRepository searchDocumentRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _modelRepository = modelRepository;
        _modelTagRepository = modelTagRepository;
        _modelCategoryRepository = modelCategoryRepository;
        _searchDocumentRepository = searchDocumentRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<UpdateModelTagsResponse>> Handle(
        UpdateModelTagsCommand command,
        CancellationToken cancellationToken)
    {
        var model = await _modelRepository.GetByIdAsync(command.ModelId, cancellationToken);

        if (model is null)
        {
            return Result.Failure<UpdateModelTagsResponse>(
                new Error("ModelNotFound", $"Model with ID {command.ModelId} was not found."));
        }

        string? categoryName = null;
        if (command.CategoryId.HasValue)
        {
            var category = await _modelCategoryRepository.GetByIdAsync(command.CategoryId.Value, cancellationToken);
            if (category == null)
            {
                return Result.Failure<UpdateModelTagsResponse>(
                    new Error("CategoryNotFound", $"Model category with ID {command.CategoryId.Value} was not found."));
            }
            categoryName = category.Name;
        }

        var now = _dateTimeProvider.UtcNow;
        var assignedTags = await AssetTagResolver.ResolveAsync(
            _modelTagRepository, command.Tags, now, cancellationToken);

        model.SetMetadata(assignedTags, command.Description, now);
        model.AssignCategory(command.CategoryId, now);

        await _modelRepository.UpdateAsync(model, cancellationToken);

        // Search reads projection state only, so the three things this command changes have
        // to be mirrored onto it in the same transaction. Tags and description were never
        // mirrored at all, which broke the loop the feature exists for: a user could label a
        // model "rustic oak dining chair" and still not retrieve it by those words. Category
        // was mirrored by SetModelCategoryCommand but not here, so the two ways to set a
        // category disagreed about what search would then report.
        await _searchDocumentRepository.SetMetadataForAssetAsync(
            ExtractionAssetTypes.Model,
            model.Id,
            ModelDtoMappings.ToTagNames(model.Tags),
            model.Description,
            cancellationToken);

        await _searchDocumentRepository.SetCategoryForAssetAsync(
            ExtractionAssetTypes.Model, model.Id, command.CategoryId, categoryName, cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(new UpdateModelTagsResponse(
            model.Id,
            ModelDtoMappings.ToTagNames(model.Tags),
            model.Description,
            model.ModelCategoryId
        ));
    }
}
