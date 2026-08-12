using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class AssetPartRepository : IAssetPartRepository
{
    private readonly ApplicationDbContext _context;

    public AssetPartRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public Task AddAsync(AssetPart part, CancellationToken cancellationToken = default)
    {
        _context.AssetParts.Add(part);
        return Task.CompletedTask;
    }

    public async Task RemoveForAssetAsync(
        string assetType,
        int assetId,
        int? versionId,
        CancellationToken cancellationToken = default)
    {
        // Load tracked and stage RemoveRange (rather than ExecuteDelete) so the
        // delete + the following re-insert commit together in the handler's single
        // SaveChanges - a failed re-extraction never leaves an asset part-less.
        var existing = await _context.AssetParts
            .Where(p => p.AssetType == assetType && p.AssetId == assetId && p.VersionId == versionId)
            .ToListAsync(cancellationToken);

        if (existing.Count > 0)
        {
            _context.AssetParts.RemoveRange(existing);
        }
    }

    public async Task<IReadOnlyList<AssetPart>> GetForAssetAsync(
        string assetType,
        int assetId,
        int? versionId,
        CancellationToken cancellationToken = default)
    {
        return await _context.AssetParts
            .AsNoTracking()
            .Where(p => p.AssetType == assetType && p.AssetId == assetId && p.VersionId == versionId)
            .OrderBy(p => p.PartPath)
            .ToListAsync(cancellationToken);
    }
}
