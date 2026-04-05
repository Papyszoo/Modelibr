using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Models;

internal sealed class UpdateModelTagsCommandHandler 
    : ICommandHandler<UpdateModelTagsCommand, UpdateModelTagsResponse>
{
    private readonly IModelRepository _modelRepository;
    private readonly IModelCategoryRepository _modelCategoryRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateModelTagsCommandHandler(
        IModelRepository modelRepository,
        IModelCategoryRepository modelCategoryRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _modelRepository = modelRepository;
        _modelCategoryRepository = modelCategoryRepository;
        _dateTimeProvider = dateTimeProvider;
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

        if (command.CategoryId.HasValue)
        {
            var category = await _modelCategoryRepository.GetByIdAsync(command.CategoryId.Value, cancellationToken);
            if (category == null)
            {
                return Result.Failure<UpdateModelTagsResponse>(
                    new Error("CategoryNotFound", $"Model category with ID {command.CategoryId.Value} was not found."));
            }
        }

        var now = _dateTimeProvider.UtcNow;
        model.SetTagsAndDescription(command.Tags, command.Description, now);
        model.AssignCategory(command.CategoryId, now);

        await _modelRepository.UpdateAsync(model, cancellationToken);

        return Result.Success(new UpdateModelTagsResponse(
            model.Id,
            model.Tags,
            model.Description,
            model.ModelCategoryId
        ));
    }
}
