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
}