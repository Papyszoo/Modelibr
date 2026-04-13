using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.EnvironmentMaps;

public record UpdateEnvironmentMapMetadataCommand(
    int EnvironmentMapId,
    IReadOnlyCollection<string>? Tags,
    int? CategoryId
) : ICommand<UpdateEnvironmentMapMetadataResponse>;

public record UpdateEnvironmentMapMetadataResponse(
    int EnvironmentMapId,
    IReadOnlyList<string> Tags,
    int? CategoryId
);

internal sealed class UpdateEnvironmentMapMetadataCommandHandler
    : ICommandHandler<UpdateEnvironmentMapMetadataCommand, UpdateEnvironmentMapMetadataResponse>
{
    private readonly IEnvironmentMapRepository _environmentMapRepository;
    private readonly IModelTagRepository _modelTagRepository;
    private readonly IEnvironmentMapCategoryRepository _environmentMapCategoryRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateEnvironmentMapMetadataCommandHandler(
        IEnvironmentMapRepository environmentMapRepository,
        IModelTagRepository modelTagRepository,
        IEnvironmentMapCategoryRepository environmentMapCategoryRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _environmentMapRepository = environmentMapRepository;
        _modelTagRepository = modelTagRepository;
        _environmentMapCategoryRepository = environmentMapCategoryRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<UpdateEnvironmentMapMetadataResponse>> Handle(
        UpdateEnvironmentMapMetadataCommand command,
        CancellationToken cancellationToken)
    {
        var environmentMap = await _environmentMapRepository.GetByIdAsync(command.EnvironmentMapId, cancellationToken);
        if (environmentMap is null)
        {
            return Result.Failure<UpdateEnvironmentMapMetadataResponse>(
                new Error("EnvironmentMapNotFound", $"Environment map with ID {command.EnvironmentMapId} was not found."));
        }

        if (command.CategoryId.HasValue)
        {
            var category = await _environmentMapCategoryRepository.GetByIdAsync(command.CategoryId.Value, cancellationToken);
            if (category is null)
            {
                return Result.Failure<UpdateEnvironmentMapMetadataResponse>(
                    new Error("CategoryNotFound", $"Environment map category with ID {command.CategoryId.Value} was not found."));
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
            await _modelTagRepository.AddRangeAsync(newTags, cancellationToken);

        environmentMap.SetMetadata(assignedTags, now);
        environmentMap.AssignCategory(command.CategoryId, now);

        await _environmentMapRepository.UpdateAsync(environmentMap, cancellationToken);

        return Result.Success(new UpdateEnvironmentMapMetadataResponse(
            environmentMap.Id,
            environmentMap.Tags.Select(tag => tag.Name).ToList(),
            environmentMap.EnvironmentMapCategoryId
        ));
    }
}
