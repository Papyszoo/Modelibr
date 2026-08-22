using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

public class ProjectProfileOptionRepository : IProjectProfileOptionRepository
{
    private readonly ApplicationDbContext _context;

    public ProjectProfileOptionRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<IReadOnlyList<ProjectProfileOption>> GetAllAsync(
        bool includeHidden = false, CancellationToken cancellationToken = default)
        => await Ordered(_context.ProjectProfileOptions.AsNoTracking(), includeHidden)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<ProjectProfileOption>> GetByDimensionAsync(
        string dimension, bool includeHidden = false, CancellationToken cancellationToken = default)
        => await Ordered(
                _context.ProjectProfileOptions.AsNoTracking().Where(o => o.Dimension == dimension),
                includeHidden)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<ProjectProfileOption>> GetByIdsAsync(
        IReadOnlyCollection<int> ids, CancellationToken cancellationToken = default)
    {
        if (ids.Count == 0)
        {
            return Array.Empty<ProjectProfileOption>();
        }

        return await _context.ProjectProfileOptions
            .AsNoTracking()
            .Where(o => ids.Contains(o.Id))
            .ToListAsync(cancellationToken);
    }

    public Task<ProjectProfileOption?> GetByNameAsync(
        string dimension, string normalizedName, CancellationToken cancellationToken = default)
        => _context.ProjectProfileOptions
            .FirstOrDefaultAsync(
                o => o.Dimension == dimension && o.NormalizedName == normalizedName, cancellationToken);

    public Task AddAsync(ProjectProfileOption option, CancellationToken cancellationToken = default)
    {
        _context.ProjectProfileOptions.Add(option);
        return Task.CompletedTask;
    }

    public Task UpdateAsync(ProjectProfileOption option, CancellationToken cancellationToken = default)
    {
        _context.UpdateIfDetached(option);
        return Task.CompletedTask;
    }

    // Built-ins first and in their seeded order, then anything the user added, alphabetically.
    // A picker that lists "Bevy" above "Unity" because someone typed it later is a picker
    // people stop scanning.
    private static IQueryable<ProjectProfileOption> Ordered(
        IQueryable<ProjectProfileOption> query, bool includeHidden)
        => (includeHidden ? query : query.Where(o => !o.IsHidden))
            .OrderBy(o => o.Dimension)
            .ThenByDescending(o => o.IsBuiltIn)
            .ThenBy(o => o.SortOrder)
            .ThenBy(o => o.Name);
}
