using Domain.Models;

namespace Application.Abstractions.Repositories;

/// <summary>
/// Repository interface for ThumbnailJob entity operations.
/// </summary>
public interface IThumbnailJobRepository
{
    /// <summary>
    /// Adds a new thumbnail job to the repository.
    /// </summary>
    Task<ThumbnailJob> AddAsync(ThumbnailJob job, CancellationToken cancellationToken = default);

    /// <summary>
    /// Updates an existing thumbnail job.
    /// </summary>
    Task UpdateAsync(ThumbnailJob job, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets a thumbnail job by ID.
    /// </summary>
    Task<ThumbnailJob?> GetByIdAsync(int id, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets a thumbnail job by model hash.
    /// </summary>
    Task<ThumbnailJob?> GetByModelHashAsync(string modelHash, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets active (pending or processing) thumbnail jobs for a specific model.
    /// </summary>
    Task<IEnumerable<ThumbnailJob>> GetActiveJobsByModelIdAsync(int modelId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets the next pending job for processing with proper locking.
    /// </summary>
    Task<ThumbnailJob?> GetNextPendingJobAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets all jobs with expired locks.
    /// </summary>
    Task<IEnumerable<ThumbnailJob>> GetJobsWithExpiredLocksAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Saves all changes to the repository.
    /// </summary>
    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}