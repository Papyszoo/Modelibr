using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IModelVersionRepository
{
    Task<ModelVersion?> GetByIdAsync(int id, CancellationToken cancellationToken = default);

    /// <summary>
    /// Loads the lightweight version rows needed by scene composition without the model,
    /// files, thumbnail, and texture-mapping graph used by the single-version editor read.
    /// </summary>
    Task<IReadOnlyList<ModelVersion>> GetByIdsAsync(
        IReadOnlyCollection<int> ids,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Loads versions with their thumbnail row, for choice cards that show what a candidate
    /// looks like. A third batch rather than a fatter one: scene writes read versions on
    /// every edit and must not start paying for a thumbnail join they never render.
    /// </summary>
    Task<IReadOnlyList<ModelVersion>> GetWithThumbnailsByIdsAsync(
        IReadOnlyCollection<int> ids,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Loads pinned versions with only their renderable-file collection for the scene
    /// resource manifest. Kept separate from the lightweight scene-facts batch.
    /// </summary>
    Task<IReadOnlyList<ModelVersion>> GetWithFilesByIdsAsync(
        IReadOnlyCollection<int> ids,
        CancellationToken cancellationToken = default);

    Task<ModelVersion?> GetDeletedByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<ModelVersion?> GetByModelIdAndVersionNumberAsync(int modelId, int versionNumber, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ModelVersion>> GetByModelIdAsync(int modelId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ModelVersion>> GetAllDeletedAsync(CancellationToken cancellationToken = default);
    Task<ModelVersion> AddAsync(ModelVersion version, CancellationToken cancellationToken = default);
    Task<ModelVersion> UpdateAsync(ModelVersion version, CancellationToken cancellationToken = default);
    Task DeleteAsync(ModelVersion version, CancellationToken cancellationToken = default);
    Task<int> GetLatestVersionNumberAsync(int modelId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Direct DB update of ModelVersion.ThumbnailId - avoids the EF graph attach
    /// that <see cref="UpdateAsync"/> triggers when called repeatedly in a loop
    /// over models with shared related entities (Packs, Projects, etc.).
    /// </summary>
    Task SetThumbnailIdAsync(int modelVersionId, int thumbnailId, CancellationToken cancellationToken = default);
    
    // Texture mapping operations (direct DB operations to avoid EF Core composite key tracking issues)
    Task AddTextureMappingAsync(int modelVersionId, int textureSetId, string materialName, CancellationToken cancellationToken = default);
    Task AddTextureMappingAsync(int modelVersionId, int textureSetId, string materialName, string variantName, CancellationToken cancellationToken = default);
    Task RemoveTextureMappingAsync(int modelVersionId, int textureSetId, string materialName, CancellationToken cancellationToken = default);
    Task RemoveTextureMappingAsync(int modelVersionId, int textureSetId, string materialName, string variantName, CancellationToken cancellationToken = default);
    Task RemoveTextureMappingsByTextureSetIdAsync(int modelVersionId, int textureSetId, CancellationToken cancellationToken = default);
    Task RemoveTextureMappingByMaterialAsync(int modelVersionId, string materialName, CancellationToken cancellationToken = default);

    /// <summary>
    /// Removes EVERY mapping for one material slot, across all variants.
    ///
    /// Distinct from the singular form above, which removes only the first match. Restoring a
    /// slot to a recorded state has to empty it first: leaving a second mapping behind would
    /// keep the binding that is being undone, alongside the one being restored.
    /// </summary>
    Task RemoveAllTextureMappingsByMaterialAsync(int modelVersionId, string materialName, CancellationToken cancellationToken = default);
    Task RemoveTextureMappingByMaterialAndVariantAsync(int modelVersionId, string materialName, string variantName, CancellationToken cancellationToken = default);
    Task RemoveTextureMappingsByVariantAsync(int modelVersionId, string variantName, CancellationToken cancellationToken = default);
}
