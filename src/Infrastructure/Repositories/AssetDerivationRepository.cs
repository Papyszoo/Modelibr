using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class AssetDerivationRepository : IAssetDerivationRepository
{
    private readonly ApplicationDbContext _context;

    public AssetDerivationRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public Task AddAsync(AssetDerivation derivation, CancellationToken cancellationToken = default)
    {
        _context.AssetDerivations.Add(derivation);
        return Task.CompletedTask;
    }

    public Task UpdateAsync(AssetDerivation derivation, CancellationToken cancellationToken = default)
    {
        _context.UpdateIfDetached(derivation);
        return Task.CompletedTask;
    }

    public async Task<AssetDerivation?> GetByKeyAsync(
        string assetType,
        int assetId,
        int? versionId,
        CancellationToken cancellationToken = default)
    {
        return await _context.AssetDerivations
            .FirstOrDefaultAsync(
                e => e.AssetType == assetType &&
                     e.AssetId == assetId &&
                     e.VersionId == versionId,
                cancellationToken);
    }

    public async Task<AssetDerivation?> GetLatestForAssetAsync(
        string assetType,
        int assetId,
        CancellationToken cancellationToken = default)
    {
        return await _context.AssetDerivations
            .AsNoTracking()
            .Where(e => e.AssetType == assetType && e.AssetId == assetId)
            .OrderByDescending(e => e.VersionId)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<AssetDerivation>> GetStaleAsync(
        string assetType,
        int currentDeriveVersion,
        CancellationToken cancellationToken = default)
    {
        return await _context.AssetDerivations
            .AsNoTracking()
            .Where(e => e.AssetType == assetType && e.DeriveVersion < currentDeriveVersion)
            .OrderBy(e => e.AssetId)
            .ToListAsync(cancellationToken);
    }
}
