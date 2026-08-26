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

    public async Task<(IReadOnlyList<AssetMetadata> Items, int TotalCount)> GetPendingAutoReviewAsync(
        string assetType,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        var query = PendingAutoReview(assetType).AsNoTracking();

        var total = await query.CountAsync(cancellationToken);
        var items = await query
            // Newest first: the assets that just landed are the ones the banner is about.
            // Id breaks the tie so a page boundary cannot show the same row twice when a
            // whole import shares one timestamp - which, on a batch, all of them do.
            .OrderByDescending(m => m.AutoAppliedAt)
            .ThenByDescending(m => m.Id)
            .Skip(Math.Max(0, page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return (items, total);
    }

    public async Task<IReadOnlyList<AssetMetadata>> GetPendingAutoReviewByIdsAsync(
        string assetType,
        IReadOnlyCollection<int> assetIds,
        CancellationToken cancellationToken = default)
    {
        if (assetIds.Count == 0)
        {
            return Array.Empty<AssetMetadata>();
        }

        // Tracked: the caller is about to mark every one of these reviewed.
        return await PendingAutoReview(assetType)
            .Where(m => assetIds.Contains(m.AssetId))
            .ToListAsync(cancellationToken);
    }

    private IQueryable<AssetMetadata> PendingAutoReview(string assetType) =>
        _context.AssetMetadata.Where(m =>
            m.AssetType == assetType &&
            m.AutoAppliedAt != null &&
            m.AutoReviewedAt == null &&
            // An asset the automation could infer nothing about is stamped as run but has
            // nothing to review. Keeping it out here is what makes the banner's count the
            // number of decisions waiting, not the number of imports.
            (m.AutoCategoryId != null || m.AutoTags.Count > 0));

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
