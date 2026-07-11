using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class PackRepository : IPackRepository
{
    private readonly ApplicationDbContext _context;

    public PackRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public Task<Pack> AddAsync(Pack pack, CancellationToken cancellationToken = default)
    {
        _context.Packs.Add(pack);
        return Task.FromResult(pack);
    }

    public async Task<IEnumerable<Pack>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Packs
            .AsNoTracking()
            .Include(p => p.Models)
            .Include(p => p.TextureSets)
            .Include(p => p.Sprites)
            .Include(p => p.Sounds)
            .Include(p => p.Scripts)
            .Include(p => p.EnvironmentMaps)
            .Include(p => p.CustomThumbnailFile)
            // Six collection includes — split to avoid a cartesian explosion
            // (and the latency that widens reactive-count races in the UI).
            .AsSplitQuery()
            .ToListAsync(cancellationToken);
    }

    public async Task<Pack?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        return await _context.Packs
            .Include(p => p.Models)
            .Include(p => p.TextureSets)
            .Include(p => p.Sprites)
            .Include(p => p.Sounds)
            .Include(p => p.Scripts)
            .Include(p => p.EnvironmentMaps)
            .Include(p => p.CustomThumbnailFile)
            .AsSplitQuery()
            .FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
    }

    public async Task<Pack?> GetByNameAsync(string name, CancellationToken cancellationToken = default)
    {
        return await _context.Packs
            .Include(p => p.Models)
            .Include(p => p.TextureSets)
            .Include(p => p.Sprites)
            .Include(p => p.Sounds)
            .Include(p => p.Scripts)
            .Include(p => p.EnvironmentMaps)
            .Include(p => p.CustomThumbnailFile)
            .AsSplitQuery()
            .FirstOrDefaultAsync(p => p.Name == name, cancellationToken);
    }

    public Task UpdateAsync(Pack pack, CancellationToken cancellationToken = default)
    {
        _context.UpdateIfDetached(pack);

        // Note: this used to catch a DbUpdateException for a duplicate
        // PackModels PK here (concurrent "add model to pack" requests racing
        // on the join table) and swallow it as an idempotent no-op. That
        // handling now lives in ApplicationDbContext's IUnitOfWork.SaveChangesAsync,
        // the single place SaveChanges is actually called from (prompt 25).
        return Task.CompletedTask;
    }

    public Task DeleteAsync(Pack pack, CancellationToken cancellationToken = default)
    {
        _context.Packs.Remove(pack);
        return Task.CompletedTask;
    }
}
