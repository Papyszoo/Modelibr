using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class ProjectReferenceRepository : IProjectReferenceRepository
{
    private readonly ApplicationDbContext _context;

    public ProjectReferenceRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<ProjectConceptImage?> GetByIdAsync(
        int projectId,
        int referenceId,
        CancellationToken cancellationToken = default)
        => await _context.ProjectConceptImages
            .Include(reference => reference.File)
            .Include(reference => reference.Links)
                .ThenInclude(link => link.ProjectLevel)
            .Include(reference => reference.Links)
                .ThenInclude(link => link.ProjectCharacter)
            .AsSplitQuery()
            .FirstOrDefaultAsync(
                reference => reference.Id == referenceId && reference.ProjectId == projectId,
                cancellationToken);

    public async Task<IEnumerable<ProjectConceptImage>> GetForProjectAsync(
        int projectId,
        int? levelId = null,
        int? characterId = null,
        CancellationToken cancellationToken = default)
    {
        var query = _context.ProjectConceptImages
            .AsNoTracking()
            .Include(reference => reference.File)
            .Include(reference => reference.Links)
                .ThenInclude(link => link.ProjectLevel)
            .Include(reference => reference.Links)
                .ThenInclude(link => link.ProjectCharacter)
            .AsSplitQuery()
            .Where(reference => reference.ProjectId == projectId);

        if (levelId.HasValue)
            query = query.Where(reference =>
                reference.Links.Any(link => link.ProjectLevelId == levelId.Value));

        if (characterId.HasValue)
            query = query.Where(reference =>
                reference.Links.Any(link => link.ProjectCharacterId == characterId.Value));

        return await query
            .OrderBy(reference => reference.SortOrder)
            .ThenBy(reference => reference.Id)
            .ToListAsync(cancellationToken);
    }

    public Task UpdateAsync(ProjectConceptImage reference, CancellationToken cancellationToken = default)
    {
        _context.UpdateIfDetached(reference);
        return Task.CompletedTask;
    }
}
