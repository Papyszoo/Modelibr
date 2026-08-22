using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class ProjectRepository : IProjectRepository
{
    private readonly ApplicationDbContext _context;

    public ProjectRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public Task<Project> AddAsync(Project project, CancellationToken cancellationToken = default)
    {
        _context.Projects.Add(project);
        return Task.FromResult(project);
    }

    public async Task<IEnumerable<Project>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Projects
            .AsNoTracking()
            .Include(p => p.Models)
            .Include(p => p.TextureSets)
            .Include(p => p.Sprites)
            .Include(p => p.Sounds)
            .Include(p => p.Scripts)
            .Include(p => p.EnvironmentMaps)
            .Include(p => p.CustomThumbnailFile)
            .Include(p => p.ConceptImages)
                .ThenInclude(ci => ci.File)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);
    }

    public async Task<Project?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.Projects
            .Include(p => p.Models)
            .Include(p => p.TextureSets)
            .Include(p => p.Sprites)
            .Include(p => p.Sounds)
            .Include(p => p.Scripts)
            .Include(p => p.EnvironmentMaps)
            .Include(p => p.CustomThumbnailFile)
            .Include(p => p.ConceptImages)
                .ThenInclude(ci => ci.File)
            .Include(p => p.ProfileValues)
                .ThenInclude(v => v.Option)
            .Include(p => p.Scenes)
            .AsSplitQuery()
            .FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
    }

    public async Task<Project?> GetByNameAsync(string name, CancellationToken cancellationToken = default)
    {
        return await _context.Projects
            .Include(p => p.Models)
            .Include(p => p.TextureSets)
            .Include(p => p.Sprites)
            .Include(p => p.Sounds)
            .Include(p => p.Scripts)
            .Include(p => p.EnvironmentMaps)
            .Include(p => p.CustomThumbnailFile)
            .Include(p => p.ConceptImages)
                .ThenInclude(ci => ci.File)
            .AsSplitQuery()
            .FirstOrDefaultAsync(p => p.Name == name, cancellationToken);
    }

    public Task UpdateAsync(Project project, CancellationToken cancellationToken = default)
    {
        _context.UpdateIfDetached(project);
        return Task.CompletedTask;
    }

    public Task DeleteAsync(Project project, CancellationToken cancellationToken = default)
    {
        _context.Projects.Remove(project);
        return Task.CompletedTask;
    }
}
