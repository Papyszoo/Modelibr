using Domain.Models;

namespace Application.Abstractions.Repositories;

/// <summary>
/// Repository interface for Thumbnail entity operations.
/// </summary>
public interface IThumbnailRepository
{
    /// <summary>
    /// Add a new thumbnail record.
    /// </summary>
    Task<Thumbnail> AddAsync(Thumbnail thumbnail, CancellationToken cancellationToken = default);

    /// <summary>
    /// Update an existing thumbnail record.
    /// </summary>
    Task UpdateAsync(Thumbnail thumbnail, CancellationToken cancellationToken = default);

    /// <summary>
    /// Get thumbnail by ID.
    /// </summary>
    Task<Thumbnail?> GetByIdAsync(int id, CancellationToken cancellationToken = default);

    /// <summary>
    /// Get thumbnail by model ID.
    /// </summary>
    Task<Thumbnail?> GetByModelIdAsync(int modelId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Get thumbnail by model hash.
    /// </summary>
    Task<Thumbnail?> GetByModelHashAsync(string modelHash, CancellationToken cancellationToken = default);

    /// <summary>
    /// Check if a thumbnail exists for a given model hash.
    /// </summary>
    Task<bool> ExistsByModelHashAsync(string modelHash, CancellationToken cancellationToken = default);

    /// <summary>
    /// Save changes to the database.
    /// </summary>
    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}