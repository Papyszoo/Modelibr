using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class ProjectCharacterTagRepository : IProjectCharacterTagRepository
{
    private readonly ApplicationDbContext _context;

    public ProjectCharacterTagRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<IReadOnlyList<ProjectCharacterTag>> GetOrCreateAsync(
        int projectId,
        IEnumerable<string>? names,
        DateTime now,
        CancellationToken cancellationToken = default)
    {
        var requested = (names ?? Array.Empty<string>())
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Select(name => name.Trim())
            .GroupBy(ProjectCharacterTag.NormalizeName, StringComparer.Ordinal)
            .Select(group => group.First())
            .ToList();
        if (requested.Count == 0)
            return Array.Empty<ProjectCharacterTag>();

        var normalizedNames = requested.Select(ProjectCharacterTag.NormalizeName).ToList();
        var existing = await _context.ProjectCharacterTags
            .Where(tag => tag.ProjectId == projectId && normalizedNames.Contains(tag.NormalizedName))
            .ToListAsync(cancellationToken);
        var result = existing.ToDictionary(tag => tag.NormalizedName, StringComparer.Ordinal);

        foreach (var name in requested)
        {
            var normalized = ProjectCharacterTag.NormalizeName(name);
            if (result.ContainsKey(normalized))
                continue;

            var tag = ProjectCharacterTag.Create(projectId, name, now);
            _context.ProjectCharacterTags.Add(tag);
            result[normalized] = tag;
        }

        return requested.Select(name => result[ProjectCharacterTag.NormalizeName(name)]).ToList();
    }
}
