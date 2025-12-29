using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IFileRepository
{
    Task<Domain.Models.File?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<Domain.Models.File?> GetDeletedByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<Domain.Models.File?> GetBySha256HashAsync(string sha256Hash, CancellationToken cancellationToken = default);
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
}