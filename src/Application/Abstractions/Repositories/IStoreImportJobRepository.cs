using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IStoreImportJobRepository
{
    Task<StoreImportJob> AddAsync(StoreImportJob job, CancellationToken cancellationToken = default);
    Task<StoreImportJob?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task UpdateAsync(StoreImportJob job, CancellationToken cancellationToken = default);

    /// <summary>
    /// Jobs still Pending/Running in the database. The queue is in-memory, so after a host
    /// restart any such job is orphaned - the consumer's startup sweep fails them so a UI
    /// polling the job is not left on a spinner forever.
    /// </summary>
    Task<IReadOnlyList<StoreImportJob>> GetUnfinishedAsync(CancellationToken cancellationToken = default);
}
