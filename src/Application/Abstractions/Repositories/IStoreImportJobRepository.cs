using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IStoreImportJobRepository
{
    Task<StoreImportJob> AddAsync(StoreImportJob job, CancellationToken cancellationToken = default);
    Task<StoreImportJob?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task UpdateAsync(StoreImportJob job, CancellationToken cancellationToken = default);
}
