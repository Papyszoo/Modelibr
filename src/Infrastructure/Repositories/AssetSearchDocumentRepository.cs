using Application.Abstractions.Repositories;
using Domain.Models;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Repositories;

internal sealed class AssetSearchDocumentRepository : IAssetSearchDocumentRepository
{
    private readonly ApplicationDbContext _context;

    public AssetSearchDocumentRepository(ApplicationDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public Task AddAsync(AssetSearchDocument document, CancellationToken cancellationToken = default)
    {
        _context.AssetSearchDocuments.Add(document);
        return Task.CompletedTask;
    }

    public async Task RemoveForAssetAsync(
        string assetType,
        int assetId,
        int? versionId,
        CancellationToken cancellationToken = default)
    {
        var existing = await _context.AssetSearchDocuments
            .Where(d => d.AssetType == assetType && d.AssetId == assetId && d.VersionId == versionId)
            .ToListAsync(cancellationToken);
        _context.AssetSearchDocuments.RemoveRange(existing);
    }

    public async Task<IReadOnlyList<AssetSearchDocument>> GetForOtherVersionsAsync(
        string assetType,
        int assetId,
        int? currentVersionId,
        CancellationToken cancellationToken = default)
    {
        return await _context.AssetSearchDocuments
            .Where(d => d.AssetType == assetType &&
                        d.AssetId == assetId &&
                        d.VersionId != currentVersionId &&
                        d.IsCurrentVersion)
            .ToListAsync(cancellationToken);
    }

    public Task UpdateAsync(AssetSearchDocument document, CancellationToken cancellationToken = default)
    {
        _context.UpdateIfDetached(document);
        return Task.CompletedTask;
    }
}
