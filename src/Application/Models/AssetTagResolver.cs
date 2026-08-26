using Application.Abstractions.Repositories;
using Domain.Models;

namespace Application.Models;

/// <summary>
/// Turns tag names into <see cref="ModelTag"/> entities, creating the ones the shared pool
/// does not have yet.
///
/// Extracted because every taggable family repeats it verbatim - sanitize, normalize, look
/// the batch up in one query, create the misses, return them in the caller's order. Six
/// copies of a find-or-create is six places for the normalization to drift, and normalization
/// is what makes "Oak" and "oak" the same tag.
/// </summary>
public static class AssetTagResolver
{
    public static async Task<IReadOnlyList<ModelTag>> ResolveAsync(
        IModelTagRepository repository,
        IEnumerable<string>? names,
        DateTime now,
        CancellationToken cancellationToken)
    {
        var sanitized = ModelTag.SanitizeNames(names);
        if (sanitized.Count == 0)
        {
            return Array.Empty<ModelTag>();
        }

        var normalized = sanitized.Select(ModelTag.NormalizeName).ToArray();
        var existing = await repository.GetByNormalizedNamesAsync(normalized, cancellationToken);
        var byNormalizedName = existing.ToDictionary(tag => tag.NormalizedName, StringComparer.Ordinal);

        var created = new List<ModelTag>();
        var assigned = new List<ModelTag>(sanitized.Count);

        foreach (var name in sanitized)
        {
            var key = ModelTag.NormalizeName(name);
            if (!byNormalizedName.TryGetValue(key, out var tag))
            {
                tag = ModelTag.Create(name, now);
                byNormalizedName[key] = tag;
                created.Add(tag);
            }

            assigned.Add(tag);
        }

        if (created.Count > 0)
        {
            await repository.AddRangeAsync(created, cancellationToken);
        }

        return assigned;
    }
}
