using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
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
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateModelTagsCommandHandler(
        IModelRepository modelRepository,
        IModelTagRepository modelTagRepository,
        IModelCategoryRepository modelCategoryRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _modelRepository = modelRepository;
        _modelTagRepository = modelTagRepository;
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
        var sanitizedNames = ModelTag.SanitizeNames(command.Tags);
        var normalizedNames = sanitizedNames
            .Select(ModelTag.NormalizeName)
            .ToArray();
        var existingTags = normalizedNames.Length == 0
            ? Array.Empty<ModelTag>()
            : await _modelTagRepository.GetByNormalizedNamesAsync(normalizedNames, cancellationToken);
        var tagsByNormalizedName = existingTags.ToDictionary(tag => tag.NormalizedName, StringComparer.Ordinal);
        var newTags = new List<ModelTag>();
        var assignedTags = new List<ModelTag>();

        foreach (var tagName in sanitizedNames)
        {
            var normalizedName = ModelTag.NormalizeName(tagName);
            if (!tagsByNormalizedName.TryGetValue(normalizedName, out var tag))
            {
                tag = ModelTag.Create(tagName, now);
                tagsByNormalizedName[normalizedName] = tag;
                newTags.Add(tag);
            }

            assignedTags.Add(tag);
        }

        if (newTags.Count > 0)
        {
            await _modelTagRepository.AddRangeAsync(newTags, cancellationToken);
        }

        model.SetMetadata(assignedTags, command.Description, now);
        model.AssignCategory(command.CategoryId, now);

        await _modelRepository.UpdateAsync(model, cancellationToken);

        return Result.Success(new UpdateModelTagsResponse(
            model.Id,
            ModelDtoMappings.ToTagNames(model.Tags),
            model.Description,
            model.ModelCategoryId
        ));
    }
}
