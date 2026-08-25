using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

public class StoreImportedItemRepository : IStoreImportedItemRepository
{
    private readonly ApplicationDbContext _context;

    public StoreImportedItemRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<StoreImportedItem?> GetByProvenanceAsync(
        string storeUrl,
        string storeAssetId,
        string storeItemId,
        CancellationToken cancellationToken = default)
    {
        return await _context.StoreImportedItems
            .AsNoTracking()
            .FirstOrDefaultAsync(
                x => x.StoreUrl == storeUrl && x.StoreAssetId == storeAssetId && x.StoreItemId == storeItemId,
                cancellationToken);
    }

    public async Task<IReadOnlyList<StoreImportedItem>> GetByAssetAsync(
        string assetType,
        int assetId,
        CancellationToken cancellationToken = default)
    {
        return await _context.StoreImportedItems
            .AsNoTracking()
            .Where(x => x.AssetType == assetType && x.AssetId == assetId)
            .ToListAsync(cancellationToken);
    }

    public Task AddAsync(StoreImportedItem item, CancellationToken cancellationToken = default)
    {
        _context.StoreImportedItems.Add(item);
        return Task.CompletedTask;
    }

    public async Task DeleteByAssetAsync(string assetType, int assetId, CancellationToken cancellationToken = default)
    {
        var existing = await _context.StoreImportedItems
            .Where(x => x.AssetType == assetType && x.AssetId == assetId)
            .ToListAsync(cancellationToken);

        if (existing.Count > 0)
        {
            _context.StoreImportedItems.RemoveRange(existing);
        }
    }

    public Task DeleteAsync(StoreImportedItem item, CancellationToken cancellationToken = default)
    {
        _context.UpdateIfDetached(item);
        _context.StoreImportedItems.Remove(item);
        return Task.CompletedTask;
    }
}
