using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.TextureSets;

public record UpdateTextureSetTagsCommand(
    int TextureSetId,
    IReadOnlyCollection<string>? Tags
) : ICommand<UpdateTextureSetTagsResponse>;

public record UpdateTextureSetTagsResponse(
    int TextureSetId,
    IReadOnlyList<string> Tags
);

internal sealed class UpdateTextureSetTagsCommandHandler
    : ICommandHandler<UpdateTextureSetTagsCommand, UpdateTextureSetTagsResponse>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IModelTagRepository _modelTagRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateTextureSetTagsCommandHandler(
        ITextureSetRepository textureSetRepository,
        IModelTagRepository modelTagRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _textureSetRepository = textureSetRepository;
        _modelTagRepository = modelTagRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<UpdateTextureSetTagsResponse>> Handle(
        UpdateTextureSetTagsCommand command,
        CancellationToken cancellationToken)
    {
        var textureSet = await _textureSetRepository.GetByIdAsync(command.TextureSetId, cancellationToken);
        if (textureSet is null)
        {
            return Result.Failure<UpdateTextureSetTagsResponse>(
                new Error("TextureSetNotFound", $"Texture set with ID {command.TextureSetId} was not found."));
        }

        var now = _dateTimeProvider.UtcNow;
        var assignedTags = await ResolveTagsAsync(command.Tags, now, cancellationToken);

        textureSet.SetTags(assignedTags, now);
        await _textureSetRepository.UpdateAsync(textureSet, cancellationToken);

        return Result.Success(new UpdateTextureSetTagsResponse(
            textureSet.Id,
            textureSet.Tags.Select(tag => tag.Name).OrderBy(name => name).ToList()));
    }

    // Resolve tag names to ModelTag entities from the shared pool, creating any
    // that don't exist yet — identical to the model and environment-map flows.
    private async Task<List<ModelTag>> ResolveTagsAsync(
        IReadOnlyCollection<string>? names,
        DateTime now,
        CancellationToken cancellationToken)
    {
        var sanitizedNames = ModelTag.SanitizeNames(names);
        var normalizedNames = sanitizedNames.Select(ModelTag.NormalizeName).ToArray();
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

        return assignedTags;
    }
}
