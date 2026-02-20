using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IFileRepository
{
    Task<Domain.Models.File?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<Domain.Models.File?> GetDeletedByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<Domain.Models.File?> GetBySha256HashAsync(string sha256Hash, CancellationToken cancellationToken = default);
    
    /// <summary>
    /// Gets a soft-deleted file by its SHA256 hash, ignoring query filters.
    /// Used during re-upload to detect and clean up recycled files.
    /// </summary>
    Task<Domain.Models.File?> GetDeletedBySha256HashAsync(string sha256Hash, CancellationToken cancellationToken = default);
    Task<IEnumerable<Domain.Models.File>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<IEnumerable<Domain.Models.File>> GetAllDeletedAsync(CancellationToken cancellationToken = default);
    Task<IEnumerable<Domain.Models.File>> GetFilesByModelIdAsync(int modelId, CancellationToken cancellationToken = default);
    Task UpdateAsync(Domain.Models.File file, CancellationToken cancellationToken = default);
    Task DeleteAsync(int id, CancellationToken cancellationToken = default);
    
    /// <summary>
    /// Checks if a file is shared by other model versions (i.e., other versions use the same file hash).
    /// </summary>
    /// <param name="fileId">The ID of the file to check</param>
    /// <param name="excludeVersionId">Version ID to exclude from the check</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>True if other versions use a file with the same hash</returns>
    Task<bool> IsFileSharedAsync(int fileId, int excludeVersionId, CancellationToken cancellationToken = default);
    
    /// <summary>
    /// Checks if any other entity (Texture, ModelVersion, Sprite, Sound) references a file with the same hash,
    /// excluding the specified file ID.
    /// </summary>
    Task<bool> IsFileHashReferencedByOthersAsync(int fileId, CancellationToken cancellationToken = default);
    
    /// <summary>
    /// Hard-deletes a File entity from the database regardless of soft-delete status.
    /// </summary>
    Task HardDeleteAsync(int id, CancellationToken cancellationToken = default);
}