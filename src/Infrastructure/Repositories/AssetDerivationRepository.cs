using Application.Abstractions.Repositories;
using Application.Extraction;
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

    public async Task<AssetDerivation?> GetForActiveVersionAsync(
        string assetType,
        int assetId,
        CancellationToken cancellationToken = default)
    {
        // Only models carry versions, so only models can have an active one that differs
        // from the newest. Everything else has a single (null-versioned) derivation and the
        // "latest" answer is the only answer.
        if (assetType == ExtractionAssetTypes.Model)
        {
            var activeVersionId = await _context.Models
                .AsNoTracking()
                .Where(m => m.Id == assetId)
                .Select(m => m.ActiveVersionId)
                .FirstOrDefaultAsync(cancellationToken);

            if (activeVersionId is not null)
            {
                var forActive = await _context.AssetDerivations
                    .AsNoTracking()
                    .FirstOrDefaultAsync(
                        e => e.AssetType == assetType &&
                             e.AssetId == assetId &&
                             e.VersionId == activeVersionId,
                        cancellationToken);

                // Falling through on null is deliberate: a model whose active version has
                // not been derived yet should still answer with the facts that exist rather
                // than report "no metadata" for an asset search can see.
                if (forActive is not null)
                {
                    return forActive;
                }
            }
        }

        return await GetLatestForAssetAsync(assetType, assetId, cancellationToken);
    }

    public async Task<IReadOnlyList<(int AssetId, int? VersionId)>> GetDerivedKeysAsync(
        string assetType,
        CancellationToken cancellationToken = default)
    {
        var keys = await _context.AssetDerivations
            .AsNoTracking()
            .Where(e => e.AssetType == assetType)
            .OrderBy(e => e.AssetId)
            .ThenBy(e => e.VersionId)
            .Select(e => new { e.AssetId, e.VersionId })
            .ToListAsync(cancellationToken);

        return keys.Select(k => (k.AssetId, k.VersionId)).ToList();
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
