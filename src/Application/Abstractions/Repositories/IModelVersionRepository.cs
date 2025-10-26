using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IModelVersionRepository
{
    Task<ModelVersion?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<ModelVersion?> GetByModelIdAndVersionNumberAsync(int modelId, int versionNumber, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ModelVersion>> GetByModelIdAsync(int modelId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ModelVersion>> GetAllDeletedAsync(CancellationToken cancellationToken = default);
    Task<ModelVersion> AddAsync(ModelVersion version, CancellationToken cancellationToken = default);
    Task<ModelVersion> UpdateAsync(ModelVersion version, CancellationToken cancellationToken = default);
    Task DeleteAsync(ModelVersion version, CancellationToken cancellationToken = default);
    Task<int> GetLatestVersionNumberAsync(int modelId, CancellationToken cancellationToken = default);
}
