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
            // Six collection includes - split to avoid a cartesian explosion
            // (and the latency that widens reactive-count races in the UI).
            .AsSplitQuery()
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<string>> GetNamesByModelIdAsync(
        int modelId,
        CancellationToken cancellationToken = default)
    {
        return await _context.Packs
            .Where(p => p.Models.Any(m => m.Id == modelId))
            .Select(p => p.Name)
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyDictionary<int, IReadOnlyList<string>>> GetNamesByModelIdsAsync(
        IEnumerable<int> modelIds,
        CancellationToken cancellationToken = default)
    {
        var ids = modelIds.Distinct().ToList();
        if (ids.Count == 0)
        {
            return new Dictionary<int, IReadOnlyList<string>>();
        }

        // Flatten the join to (modelId, packName) pairs in one round trip, then group in
        // memory - grouping server-side would need a second pass to materialise anyway.
        var pairs = await _context.Packs
            .SelectMany(
                p => p.Models.Where(m => ids.Contains(m.Id)),
                (p, m) => new { ModelId = m.Id, PackName = p.Name })
            .ToListAsync(cancellationToken);

        return pairs
            .GroupBy(x => x.ModelId)
            .ToDictionary(
                g => g.Key,
                g => (IReadOnlyList<string>)g.Select(x => x.PackName).ToList());
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

    public Task<Pack?> GetByStoreImportAsync(string storeUrl, string storeAssetId, CancellationToken cancellationToken = default)
    {
        // Idempotency probe only - the importer just needs the pack's identity, so no
        // collection navigations are loaded (a big imported pack would drag hundreds of rows).
        return _context.Packs
            .FirstOrDefaultAsync(
                p => p.StoreImportUrl == storeUrl && p.StoreImportAssetId == storeAssetId,
                cancellationToken);
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
