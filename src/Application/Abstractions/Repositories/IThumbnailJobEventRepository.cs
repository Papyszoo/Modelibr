using Domain.Models;

namespace Application.Abstractions.Repositories;

/// <summary>
/// Repository interface for ThumbnailJobEvent entity operations.
/// </summary>
public interface IThumbnailJobEventRepository
{
    /// <summary>
    /// Adds a new thumbnail job event to the repository.
    /// </summary>
    Task<ThumbnailJobEvent> AddAsync(ThumbnailJobEvent jobEvent, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets all events for a specific thumbnail job, ordered by occurrence time.
    /// </summary>
    Task<IEnumerable<ThumbnailJobEvent>> GetByJobIdAsync(int thumbnailJobId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Saves all changes to the repository.
    /// </summary>
    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}
