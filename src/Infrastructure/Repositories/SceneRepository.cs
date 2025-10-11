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
            .OrderByDescending(s => s.CreatedAt)
            .ToListAsync(cancellationToken);
    }

    public async Task AddAsync(Scene scene, CancellationToken cancellationToken = default)
    {
        await _context.Scenes.AddAsync(scene, cancellationToken);
        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task UpdateAsync(Scene scene, CancellationToken cancellationToken = default)
    {
        _context.Scenes.Update(scene);
        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        var scene = await GetByIdAsync(id, cancellationToken);
        if (scene != null)
        {
            _context.Scenes.Remove(scene);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }
}
