using Domain.Models;

namespace Application.Abstractions.Repositories;

/// <summary>
/// Persistence for the derived-signal layer. Rows are upserted by the
/// (AssetType, AssetId, VersionId) key so re-derivation is idempotent and never
/// touches the raw extraction rows.
/// </summary>
public interface IAssetDerivationRepository
{
    Task AddAsync(AssetDerivation derivation, CancellationToken cancellationToken = default);

    Task UpdateAsync(AssetDerivation derivation, CancellationToken cancellationToken = default);

    /// <summary>Loads the row for an exact derive key (tracked, for upsert), or null.</summary>
    Task<AssetDerivation?> GetByKeyAsync(
        string assetType,
        int assetId,
        int? versionId,
        CancellationToken cancellationToken = default);

    /// <summary>The most recent derivation for an asset (highest version) — the "current" one for reads.</summary>
    Task<AssetDerivation?> GetLatestForAssetAsync(
        string assetType,
        int assetId,
        CancellationToken cancellationToken = default);

    /// <summary>Derived rows whose <see cref="AssetDerivation.DeriveVersion"/> is below the current one (re-derive candidates).</summary>
    Task<IReadOnlyList<AssetDerivation>> GetStaleAsync(
        string assetType,
        int currentDeriveVersion,
        CancellationToken cancellationToken = default);
}
