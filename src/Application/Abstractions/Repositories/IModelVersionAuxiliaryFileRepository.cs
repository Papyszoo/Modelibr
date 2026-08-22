using Domain.Models;

namespace Application.Abstractions.Repositories;

/// <summary>
/// Persistence for auxiliary (external) glTF resources linked to a model version -
/// the <c>.bin</c> buffers and textures a loose <c>.gltf</c> references. Writes stage
/// the join (and cascade-insert any new aux file) within the caller's unit of work.
/// </summary>
public interface IModelVersionAuxiliaryFileRepository
{
    /// <summary>Stages a new auxiliary-file link. No commit. Duplicate (versionId, relativePath) is ignored.</summary>
    Task AddAsync(ModelVersionAuxiliaryFile auxiliaryFile, CancellationToken cancellationToken = default);

    /// <summary>Whether the version already links the given normalized relative path.</summary>
    Task<bool> ExistsAsync(int modelVersionId, string relativePath, CancellationToken cancellationToken = default);

    /// <summary>All auxiliary files for a version, each with its linked File loaded, ordered by relative path.</summary>
    Task<IReadOnlyList<ModelVersionAuxiliaryFile>> GetForVersionAsync(int modelVersionId, CancellationToken cancellationToken = default);

    /// <summary>All auxiliary files for a set of pinned versions, loaded in one read.</summary>
    Task<IReadOnlyList<ModelVersionAuxiliaryFile>> GetForVersionsAsync(
        IReadOnlyCollection<int> modelVersionIds,
        CancellationToken cancellationToken = default);
}
