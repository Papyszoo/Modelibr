using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IPackRepository
{
    Task<Pack> AddAsync(Pack pack, CancellationToken cancellationToken = default);
    Task<IEnumerable<Pack>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<Pack?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<Pack?> GetByNameAsync(string name, CancellationToken cancellationToken = default);
    Task UpdateAsync(Pack pack, CancellationToken cancellationToken = default);
    Task DeleteAsync(Pack pack, CancellationToken cancellationToken = default);
}
