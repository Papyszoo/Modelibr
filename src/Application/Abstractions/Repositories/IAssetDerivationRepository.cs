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

    /// <summary>
    /// Derived rows per family, and how many of them are behind
    /// <paramref name="currentDeriveVersion"/>.
    ///
    /// Aggregated in the database. "How much of my library is indexed" is a question an
    /// agent asks in a loop while an import runs, and answering it by reading every row
    /// would make asking it the expensive part.
    /// </summary>
    Task<IReadOnlyList<(string AssetType, int Derived, int Stale)>> CountDerivedByTypeAsync(
        int currentDeriveVersion,
        CancellationToken cancellationToken = default);

    /// <summary>The most recent derivation for an asset (highest version).</summary>
    /// <remarks>
    /// Highest version id, which is NOT the same thing as the version the rest of the app
    /// answers with - see <see cref="GetForActiveVersionAsync"/>. Kept for callers that
    /// genuinely mean "the newest row"; reads that must agree with search want the other one.
    /// </remarks>
    Task<AssetDerivation?> GetLatestForAssetAsync(
        string assetType,
        int assetId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Loads every derived row for the requested assets in one read. Scene composition uses
    /// the exact pinned version when present and otherwise selects the newest row in memory,
    /// avoiding one or two database round trips per placed asset.
    /// </summary>
    Task<IReadOnlyList<AssetDerivation>> GetForAssetsAsync(
        string assetType,
        IReadOnlyCollection<int> assetIds,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// The derivation for the asset's <b>active</b> version - the version search returns and
    /// scene nodes pin.
    /// </summary>
    /// <remarks>
    /// Active version and highest version id diverge the moment anyone rolls a model back:
    /// <c>SetActiveVersionCommandHandler</c> re-points the search projection at the chosen
    /// version, so search offers v1 while the newest derived row is v2. Reading facts from the
    /// wrong one is silent - an agent picks a candidate from search, inspects the other
    /// version's triangle counts and bounds, and places the first one on the second one's
    /// measurements. Falls back to the highest version when the asset has no active version
    /// (unversioned families) or that version was never derived.
    /// </remarks>
    Task<AssetDerivation?> GetForActiveVersionAsync(
        string assetType,
        int assetId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Every (asset, version) key that has a derived row - the worklist for a projection
    /// rebuild.
    /// </summary>
    /// <remarks>
    /// Keys only, deliberately. The rows themselves carry a jsonb payload per asset, and a
    /// library-wide rebuild that started by loading all of them would hold the whole derived
    /// layer in memory before writing its first document.
    /// </remarks>
    Task<IReadOnlyList<(int AssetId, int? VersionId)>> GetDerivedKeysAsync(
        string assetType,
        CancellationToken cancellationToken = default);

    /// <summary>Derived rows whose <see cref="AssetDerivation.DeriveVersion"/> is below the current one (re-derive candidates).</summary>
    Task<IReadOnlyList<AssetDerivation>> GetStaleAsync(
        string assetType,
        int currentDeriveVersion,
        CancellationToken cancellationToken = default);
}
