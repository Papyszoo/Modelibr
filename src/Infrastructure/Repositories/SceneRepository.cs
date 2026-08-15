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
        return await _context.Scenes.FindAsync([id], cancellationToken);
    }

    public async Task<IEnumerable<Scene>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Scenes
            .AsNoTracking()
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
