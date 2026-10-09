using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class AssetExtractionRepository : IAssetExtractionRepository
{
    private readonly ApplicationDbContext _context;

    public AssetExtractionRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public Task AddAsync(AssetExtraction extraction, CancellationToken cancellationToken = default)
    {
        _context.AssetExtractions.Add(extraction);
        return Task.CompletedTask;
    }

    public Task UpdateAsync(AssetExtraction extraction, CancellationToken cancellationToken = default)
    {
        _context.UpdateIfDetached(extraction);
        return Task.CompletedTask;
    }

    public async Task<AssetExtraction?> GetByKeyAsync(
        string assetType,
        int assetId,
        int? versionId,
        string fileSha256,
        CancellationToken cancellationToken = default)
    {
        return await _context.AssetExtractions
            .FirstOrDefaultAsync(
                e => e.AssetType == assetType &&
                     e.AssetId == assetId &&
                     e.VersionId == versionId &&
                     e.FileSha256 == fileSha256,
                cancellationToken);
    }

    public async Task<AssetExtraction?> GetLatestForAssetAsync(
        string assetType,
        int assetId,
        int? versionId = null,
        CancellationToken cancellationToken = default)
    {
        var query = _context.AssetExtractions
            .AsNoTracking()
            .Where(e => e.AssetType == assetType && e.AssetId == assetId);

        // Exact version when one is named; any version (newest first) otherwise.
        if (versionId is { } version)
        {
            query = query.Where(e => e.VersionId == version);
        }

        return await query
            .OrderByDescending(e => e.UpdatedAt)
            .ThenByDescending(e => e.Id)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<AssetExtraction>> GetStaleAsync(
        string assetType,
        int currentExtractorVersion,
        CancellationToken cancellationToken = default)
    {
        return await _context.AssetExtractions
            .AsNoTracking()
            .Where(e => e.AssetType == assetType && e.ExtractorVersion < currentExtractorVersion)
            .OrderBy(e => e.AssetId)
            .ToListAsync(cancellationToken);
    }
}
