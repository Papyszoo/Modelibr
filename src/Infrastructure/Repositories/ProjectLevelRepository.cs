using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class ProjectLevelRepository : IProjectLevelRepository
{
    private readonly ApplicationDbContext _context;

    public ProjectLevelRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public Task<ProjectLevel> AddAsync(ProjectLevel level, CancellationToken cancellationToken = default)
    {
        _context.ProjectLevels.Add(level);
        return Task.FromResult(level);
    }

    public async Task<ProjectLevel?> GetByIdAsync(
        int projectId,
        int levelId,
        CancellationToken cancellationToken = default)
        => await _context.ProjectLevels
            .Include(level => level.CharacterVariants)
            .FirstOrDefaultAsync(
                level => level.Id == levelId && level.ProjectId == projectId,
                cancellationToken);

    public async Task<IEnumerable<ProjectLevel>> GetForProjectAsync(
        int projectId,
        CancellationToken cancellationToken = default)
        => await _context.ProjectLevels
            .AsNoTracking()
            .Include(level => level.CharacterVariants)
            .Where(level => level.ProjectId == projectId)
            .OrderBy(level => level.SortOrder)
            .ThenBy(level => level.Name)
            .ThenBy(level => level.Id)
            .ToListAsync(cancellationToken);

    public async Task<int> GetNextSortOrderAsync(
        int projectId,
        CancellationToken cancellationToken = default)
    {
        var maxSortOrder = await _context.ProjectLevels
            .Where(level => level.ProjectId == projectId)
            .Select(level => (int?)level.SortOrder)
            .MaxAsync(cancellationToken);
        return (maxSortOrder ?? -1) + 1;
    }

    public Task<bool> NameExistsAsync(
        int projectId,
        string name,
        int? excludingLevelId = null,
        CancellationToken cancellationToken = default)
    {
        var normalizedName = name.Trim();
        return _context.ProjectLevels.AnyAsync(
            level => level.ProjectId == projectId
                && level.Name == normalizedName
                && (!excludingLevelId.HasValue || level.Id != excludingLevelId.Value),
            cancellationToken);
    }

    public Task UpdateAsync(ProjectLevel level, CancellationToken cancellationToken = default)
    {
        _context.UpdateIfDetached(level);
        return Task.CompletedTask;
    }

    public Task DeleteAsync(ProjectLevel level, CancellationToken cancellationToken = default)
    {
        _context.ProjectLevels.Remove(level);
        return Task.CompletedTask;
    }
}
