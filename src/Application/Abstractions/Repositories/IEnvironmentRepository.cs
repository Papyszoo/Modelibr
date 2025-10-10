using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IEnvironmentRepository
{
    Task<Domain.Models.Environment> AddAsync(Domain.Models.Environment environment, CancellationToken cancellationToken = default);
    Task<IEnumerable<Domain.Models.Environment>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<Domain.Models.Environment?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<Domain.Models.Environment?> GetDefaultAsync(CancellationToken cancellationToken = default);
    Task<Domain.Models.Environment?> GetByNameAsync(string name, CancellationToken cancellationToken = default);
    Task UpdateAsync(Domain.Models.Environment environment, CancellationToken cancellationToken = default);
    Task DeleteAsync(int id, CancellationToken cancellationToken = default);
}
