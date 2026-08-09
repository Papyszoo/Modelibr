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

    public async Task RemoveAllForAssetAsync(
        string assetType,
        int assetId,
        CancellationToken cancellationToken = default)
    {
        var existing = await _context.AssetSearchDocuments
            .Where(d => d.AssetType == assetType && d.AssetId == assetId)
            .ToListAsync(cancellationToken);
        _context.AssetSearchDocuments.RemoveRange(existing);
    }

    public async Task SetCurrentVersionAsync(
        string assetType,
        int assetId,
        int? currentVersionId,
        CancellationToken cancellationToken = default)
    {
        var documents = await _context.AssetSearchDocuments
            .Where(d => d.AssetType == assetType && d.AssetId == assetId)
            .ToListAsync(cancellationToken);

        foreach (var document in documents)
        {
            document.SetCurrentVersion(document.VersionId == currentVersionId);
            _context.UpdateIfDetached(document);
        }
    }

    public async Task SetActiveForAssetAsync(
        string assetType,
        int assetId,
        bool isActive,
        CancellationToken cancellationToken = default)
    {
        var documents = await _context.AssetSearchDocuments
            .Where(d => d.AssetType == assetType && d.AssetId == assetId && d.IsActive != isActive)
            .ToListAsync(cancellationToken);

        foreach (var document in documents)
        {
            document.SetActive(isActive);
            _context.UpdateIfDetached(document);
        }
    }

    public async Task SetActiveForVersionAsync(
        string assetType,
        int assetId,
        int versionId,
        bool isActive,
        CancellationToken cancellationToken = default)
    {
        var documents = await _context.AssetSearchDocuments
            .Where(d => d.AssetType == assetType &&
                        d.AssetId == assetId &&
                        d.VersionId == versionId &&
                        d.IsActive != isActive)
            .ToListAsync(cancellationToken);

        foreach (var document in documents)
        {
            document.SetActive(isActive);
            _context.UpdateIfDetached(document);
        }
    }

    public async Task SetCategoryForAssetAsync(
        string assetType,
        int assetId,
        int? categoryId,
        string? categoryName,
        CancellationToken cancellationToken = default)
    {
        var documents = await _context.AssetSearchDocuments
            .Where(d => d.AssetType == assetType && d.AssetId == assetId)
            .ToListAsync(cancellationToken);

        foreach (var document in documents)
        {
            document.SetCategory(categoryId, categoryName);
            _context.UpdateIfDetached(document);
        }
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
