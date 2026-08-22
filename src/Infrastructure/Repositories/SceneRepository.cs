using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class SceneRepository : ISceneRepository
{
    private readonly ApplicationDbContext _context;

    public SceneRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<Scene?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        // Includes the project rather than using FindAsync: every scene read reports the
        // project it belongs to, and a summary that carried a project id with no name would
        // make the editor and the agent describe the same scene differently. Still tracked -
        // the write paths take this same read.
        return await _context.Scenes
            .Include(s => s.Project)
            .FirstOrDefaultAsync(s => s.Id == id, cancellationToken);
    }

    public async Task<IEnumerable<Scene>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Scenes
            .AsNoTracking()
            .Include(s => s.Project)
            .OrderByDescending(s => s.UpdatedAt)
            .ToListAsync(cancellationToken);
    }

    public async Task AddAsync(Scene scene, CancellationToken cancellationToken = default)
    {
        await _context.Scenes.AddAsync(scene, cancellationToken);
    }

    public Task UpdateAsync(Scene scene, CancellationToken cancellationToken = default)
    {
        _context.UpdateIfDetached(scene);
        return Task.CompletedTask;
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        var scene = await GetByIdAsync(id, cancellationToken);
        if (scene is not null)
        {
            _context.Scenes.Remove(scene);
        }
    }
}
