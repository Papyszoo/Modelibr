using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IStageRepository
{
    Task<Stage?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<IEnumerable<Stage>> GetAllAsync(CancellationToken cancellationToken = default);
    Task AddAsync(Stage stage, CancellationToken cancellationToken = default);
    Task UpdateAsync(Stage stage, CancellationToken cancellationToken = default);
    Task DeleteAsync(int id, CancellationToken cancellationToken = default);
}
