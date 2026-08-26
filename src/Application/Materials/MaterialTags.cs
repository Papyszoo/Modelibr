using Application.Abstractions.Repositories;
using Domain.Models;

namespace Application.Materials;

/// <summary>
/// Resolves tag names against the shared <see cref="ModelTag"/> pool, creating any
/// that do not exist yet. Same flow the model, environment-map and texture-set
/// handlers each spell out inline; materials have two callers, so it lives here
/// once rather than twice.
/// </summary>
internal static class MaterialTags
{
    public static async Task<List<ModelTag>> ResolveAsync(
        IModelTagRepository modelTagRepository,
        IReadOnlyCollection<string>? names,
        DateTime now,
        CancellationToken cancellationToken)
    {
        var sanitizedNames = ModelTag.SanitizeNames(names);
        var normalizedNames = sanitizedNames.Select(ModelTag.NormalizeName).ToArray();
        var existingTags = normalizedNames.Length == 0
            ? Array.Empty<ModelTag>()
            : await modelTagRepository.GetByNormalizedNamesAsync(normalizedNames, cancellationToken);
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
            await modelTagRepository.AddRangeAsync(newTags, cancellationToken);

        return assignedTags;
    }
}
