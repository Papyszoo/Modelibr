using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class SceneRenderRepository : ISceneRenderRepository
{
    private readonly ApplicationDbContext _context;

    public SceneRenderRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task AddAsync(SceneRender render, CancellationToken cancellationToken = default)
    {
        await _context.SceneRenders.AddAsync(render, cancellationToken);
    }

    public async Task<SceneRender?> GetByJobIdAsync(int thumbnailJobId, CancellationToken cancellationToken = default)
    {
        return await _context.SceneRenders
            .AsNoTracking()
            .FirstOrDefaultAsync(sr => sr.ThumbnailJobId == thumbnailJobId, cancellationToken);
    }

    public async Task<SceneRender?> GetLatestForSceneAsync(int sceneId, CancellationToken cancellationToken = default)
    {
        return await _context.SceneRenders
            .AsNoTracking()
            .Where(sr => sr.SceneId == sceneId)
            .OrderByDescending(sr => sr.CreatedAt)
            .ThenByDescending(sr => sr.Id)
            .FirstOrDefaultAsync(cancellationToken);
    }
}
