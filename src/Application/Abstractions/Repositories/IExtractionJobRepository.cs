using Domain.Models;

namespace Application.Abstractions.Repositories;

/// <summary>
/// Concurrency-safe persistence for the decoupled extraction queue. Mirrors
/// <see cref="IThumbnailJobRepository"/> but schedules per extractor family and
/// never self-commits — the atomic claim is a single UPDATE, so command handlers
/// still own the unit of work.
/// </summary>
public interface IExtractionJobRepository
{
    Task<ExtractionJob> AddAsync(ExtractionJob job, CancellationToken cancellationToken = default);

    Task UpdateAsync(ExtractionJob job, CancellationToken cancellationToken = default);

    Task<ExtractionJob?> GetByIdAsync(int id, CancellationToken cancellationToken = default);

    /// <summary>
    /// The live (Pending/Processing) job for a target, if any — used for dedup so
    /// re-queuing an asset that is already queued is a no-op.
    /// </summary>
    Task<ExtractionJob?> GetLiveJobAsync(
        string assetType,
        int assetId,
        int? versionId,
        string extractorFamily,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// The oldest claimable job in a family (Pending, or Processing with an
    /// expired lock). Read-only — claim it atomically with
    /// <see cref="TryClaimJobAsync"/>.
    /// </summary>
    Task<ExtractionJob?> GetNextClaimableJobAsync(
        string extractorFamily,
        DateTime nowUtc,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Atomically claims a job by id if it is still Pending or its lock has
    /// expired. Returns true when this caller won the row. A single UPDATE, so no
    /// SaveChangesAsync / transaction is needed (keeps the repo non-self-committing).
    /// </summary>
    Task<bool> TryClaimJobAsync(
        int jobId,
        string workerId,
        DateTime claimedAtUtc,
        CancellationToken cancellationToken = default);
}
