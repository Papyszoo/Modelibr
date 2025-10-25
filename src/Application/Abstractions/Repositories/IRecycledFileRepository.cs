using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IRecycledFileRepository
{
    Task<RecycledFile?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<RecycledFile>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<RecycledFile>> GetExpiredAsync(DateTime beforeDate, CancellationToken cancellationToken = default);
    Task<RecycledFile> AddAsync(RecycledFile recycledFile, CancellationToken cancellationToken = default);
    Task DeleteAsync(int id, CancellationToken cancellationToken = default);
    Task<int> DeleteExpiredAsync(DateTime beforeDate, CancellationToken cancellationToken = default);
}
