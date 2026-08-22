using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

public class AssetMetadataRepository : IAssetMetadataRepository
{
    private readonly ApplicationDbContext _context;

    public AssetMetadataRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public Task<AssetMetadata?> GetAsync(string assetType, int assetId, CancellationToken cancellationToken = default)
    {
        // Tracked, not AsNoTracking: every caller of the single-row read is about to write
        // it back. A no-tracking read here would make each write re-attach a detached graph
        // for no benefit.
        return _context.AssetMetadata
            .FirstOrDefaultAsync(m => m.AssetType == assetType && m.AssetId == assetId, cancellationToken);
    }

    public async Task<IReadOnlyList<AssetMetadata>> GetManyAsync(
        string assetType,
        IReadOnlyCollection<int> assetIds,
        CancellationToken cancellationToken = default)
    {
        if (assetIds.Count == 0)
        {
            return Array.Empty<AssetMetadata>();
        }

        return await _context.AssetMetadata
            .AsNoTracking()
            .Where(m => m.AssetType == assetType && assetIds.Contains(m.AssetId))
            .ToListAsync(cancellationToken);
    }

    public Task AddAsync(AssetMetadata metadata, CancellationToken cancellationToken = default)
    {
        _context.AssetMetadata.Add(metadata);
        return Task.CompletedTask;
    }

    public Task UpdateAsync(AssetMetadata metadata, CancellationToken cancellationToken = default)
    {
        _context.UpdateIfDetached(metadata);
        return Task.CompletedTask;
    }

    public Task DeleteAsync(AssetMetadata metadata, CancellationToken cancellationToken = default)
    {
        _context.AssetMetadata.Remove(metadata);
        return Task.CompletedTask;
    }
}
