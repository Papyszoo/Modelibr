using Domain.Models;
using EnvironmentEntity = Domain.Models.Environment;

namespace Application.Abstractions.Repositories;

public interface IEnvironmentRepository
{
    Task<EnvironmentEntity?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<IEnumerable<EnvironmentEntity>> GetAllAsync(CancellationToken cancellationToken = default);
    Task AddAsync(EnvironmentEntity environment, CancellationToken cancellationToken = default);
    Task UpdateAsync(EnvironmentEntity environment, CancellationToken cancellationToken = default);
    Task DeleteAsync(int id, CancellationToken cancellationToken = default);
}
