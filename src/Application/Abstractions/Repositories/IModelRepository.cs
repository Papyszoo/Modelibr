using Application.Models;
using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IModelRepository
{
    Task<Model> AddAsync(Model model, CancellationToken cancellationToken = default);

    Task<IEnumerable<Model>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<IEnumerable<Model>> GetAllDeletedAsync(CancellationToken cancellationToken = default);
    Task<Model?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<Model?> GetByIdForAssociationAsync(int id, CancellationToken cancellationToken = default);
    Task<Model?> GetDeletedByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<Model?> GetByFileHashAsync(string sha256Hash, CancellationToken cancellationToken = default);
    Task<Model?> GetDeletedByFileHashAsync(string sha256Hash, CancellationToken cancellationToken = default);
    Task<bool> ExistsByNameAsync(string name, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<string>> GetNamesByPrefixAsync(string prefix, CancellationToken cancellationToken = default);
    Task<(IEnumerable<Model> Items, int TotalCount)> GetPagedAsync(
        int page, int pageSize,
        IReadOnlyCollection<int>? packIds = null,
        IReadOnlyCollection<int>? projectIds = null,
        int? textureSetId = null,
        IReadOnlyCollection<int>? categoryIds = null,
        IReadOnlyCollection<string>? normalizedTagNames = null,
        bool? hasConceptImages = null,
        string? searchName = null,
        CancellationToken cancellationToken = default);
    Task<(IEnumerable<ModelListDto> Items, int TotalCount)> GetPagedListAsync(
        int page, int pageSize,
        IReadOnlyCollection<int>? packIds = null,
        IReadOnlyCollection<int>? projectIds = null,
        int? textureSetId = null,
        IReadOnlyCollection<int>? categoryIds = null,
        IReadOnlyCollection<string>? normalizedTagNames = null,
        bool? hasConceptImages = null,
        string? searchName = null,
        int? minTriangleCount = null,
        int? maxTriangleCount = null,
        bool? hasAnimations = null,
        string? uvStatus = null,
        bool? uncategorized = null,
        CancellationToken cancellationToken = default);
    /// <summary>
    /// Ids of the models whose current version carries this UV layout, from the search
    /// projection. Exists so the unpaginated list path can honour the filter too - it works
    /// on materialised entities and cannot reach the projection itself, and a filter the
    /// caller asked for and silently did not get is worse than no filter at all.
    /// </summary>
    Task<IReadOnlyCollection<int>> GetModelIdsByUvStatusAsync(
        string uvStatus, CancellationToken cancellationToken = default);

    /// <summary>
    /// Just the name and active version of a set of models, in one query. For list surfaces
    /// that hold model ids from somewhere else - the import review queue holds them from the
    /// metadata side table - and need a name and a picture, not an aggregate each.
    /// </summary>
    Task<IReadOnlyList<ModelIdentity>> GetIdentitiesAsync(
        IReadOnlyCollection<int> ids, CancellationToken cancellationToken = default);

    Task<CategoryAssetCounts> GetCategoryAssetCountsAsync(CancellationToken cancellationToken = default);
    Task<(int? ActiveVersionId, Domain.Models.Thumbnail? Thumbnail)?> GetThumbnailDataAsync(
        int modelId, CancellationToken cancellationToken = default);
    Task UpdateAsync(Model model, CancellationToken cancellationToken = default);
    Task DeleteAsync(int id, CancellationToken cancellationToken = default);
}
