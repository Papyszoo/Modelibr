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

    public async Task<IReadOnlySet<string>> GetImportedStoreAssetIdsAsync(
        string storeUrl,
        IReadOnlyCollection<string> storeAssetIds,
        CancellationToken cancellationToken = default)
    {
        if (storeAssetIds.Count == 0)
        {
            return new HashSet<string>();
        }

        var ids = storeAssetIds.Distinct().ToList();
        var imported = await _context.Packs
            .Where(p => p.StoreImportUrl == storeUrl
                        && p.StoreImportAssetId != null
                        && ids.Contains(p.StoreImportAssetId))
            .Select(p => p.StoreImportAssetId!)
            .ToListAsync(cancellationToken);

        return imported.ToHashSet();
    }

    public async Task EnsureModelInPackAsync(
        int packId,
        int modelId,
        DateTime updatedAt,
        CancellationToken cancellationToken = default)
    {
        await _context.Database.ExecuteSqlInterpolatedAsync(
            $"INSERT INTO \"PackModels\" (\"ModelsId\", \"PacksId\") VALUES ({modelId}, {packId}) ON CONFLICT (\"ModelsId\", \"PacksId\") DO NOTHING;",
            cancellationToken);

        var trackedPack = _context.Packs.Local.FirstOrDefault(p => p.Id == packId);
        if (trackedPack != null)
        {
            _context.Entry(trackedPack).Property(p => p.UpdatedAt).CurrentValue = updatedAt;
        }
        else
        {
            await _context.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE \"Packs\" SET \"UpdatedAt\" = {updatedAt} WHERE \"Id\" = {packId};",
                cancellationToken);
        }
    }

    public Task UpdateAsync(Pack pack, CancellationToken cancellationToken = default)
    {
        _context.UpdateIfDetached(pack);
        return Task.CompletedTask;
    }

    public Task DeleteAsync(Pack pack, CancellationToken cancellationToken = default)
    {
        _context.Packs.Remove(pack);
        return Task.CompletedTask;
    }
}
