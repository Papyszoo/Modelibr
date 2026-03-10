using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IModelVersionRepository
{
    Task<ModelVersion?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<ModelVersion?> GetDeletedByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<ModelVersion?> GetByModelIdAndVersionNumberAsync(int modelId, int versionNumber, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ModelVersion>> GetByModelIdAsync(int modelId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ModelVersion>> GetAllDeletedAsync(CancellationToken cancellationToken = default);
    Task<ModelVersion> AddAsync(ModelVersion version, CancellationToken cancellationToken = default);
    Task<ModelVersion> UpdateAsync(ModelVersion version, CancellationToken cancellationToken = default);
    Task DeleteAsync(ModelVersion version, CancellationToken cancellationToken = default);
    Task<int> GetLatestVersionNumberAsync(int modelId, CancellationToken cancellationToken = default);
    
    // Texture mapping operations (direct DB operations to avoid EF Core composite key tracking issues)
    Task AddTextureMappingAsync(int modelVersionId, int textureSetId, string materialName, CancellationToken cancellationToken = default);
    Task AddTextureMappingAsync(int modelVersionId, int textureSetId, string materialName, string variantName, CancellationToken cancellationToken = default);
    Task RemoveTextureMappingAsync(int modelVersionId, int textureSetId, string materialName, CancellationToken cancellationToken = default);
    Task RemoveTextureMappingsByTextureSetIdAsync(int modelVersionId, int textureSetId, CancellationToken cancellationToken = default);
    Task RemoveTextureMappingByMaterialAsync(int modelVersionId, string materialName, CancellationToken cancellationToken = default);
    Task RemoveTextureMappingByMaterialAndVariantAsync(int modelVersionId, string materialName, string variantName, CancellationToken cancellationToken = default);
    Task RemoveTextureMappingsByVariantAsync(int modelVersionId, string variantName, CancellationToken cancellationToken = default);
}
