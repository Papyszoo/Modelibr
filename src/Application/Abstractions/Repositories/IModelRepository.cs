using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IModelRepository
{
    Task<Model> AddAsync(Model model, CancellationToken cancellationToken = default);
    Task<IEnumerable<Model>> GetAllAsync(CancellationToken cancellationToken = default);
}