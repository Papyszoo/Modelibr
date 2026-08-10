using Domain.Models;

namespace Application.Abstractions.Repositories;

/// <summary>
/// Persistence for scene-graph parts. Re-extraction replaces an asset+version's
/// parts wholesale, so the write path is delete-existing + add-new inside one
/// unit of work.
/// </summary>
public interface IAssetPartRepository
{
    Task AddAsync(AssetPart part, CancellationToken cancellationToken = default);

    /// <summary>Stages removal of all parts for an asset+version (replace semantics). No commit.</summary>
    Task RemoveForAssetAsync(
        string assetType,
        int assetId,
        int? versionId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<AssetPart>> GetForAssetAsync(
        string assetType,
        int assetId,
        int? versionId,
        CancellationToken cancellationToken = default);
}
