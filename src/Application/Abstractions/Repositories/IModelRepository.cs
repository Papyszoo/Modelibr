using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IModelRepository
{
    Task<Model> AddAsync(Model model, CancellationToken cancellationToken = default);
    Task<Model> AddFileAsync(int modelId, Domain.Models.File file, CancellationToken cancellationToken = default);
    Task<IEnumerable<Model>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<IEnumerable<Model>> GetAllDeletedAsync(CancellationToken cancellationToken = default);
    Task<Model?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<Model?> GetByFileHashAsync(string sha256Hash, CancellationToken cancellationToken = default);
    Task UpdateAsync(Model model, CancellationToken cancellationToken = default);
}