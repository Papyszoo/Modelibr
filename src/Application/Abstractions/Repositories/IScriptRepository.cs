using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IScriptRepository
{
    Task<Script> AddAsync(Script script, CancellationToken cancellationToken = default);
    Task<IEnumerable<Script>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<IEnumerable<Script>> GetAllDeletedAsync(CancellationToken cancellationToken = default);
    Task<Script?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<Script?> GetDeletedByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<Script?> GetByNameAsync(string name, CancellationToken cancellationToken = default);
    Task<Script?> GetByFileHashAsync(string sha256Hash, CancellationToken cancellationToken = default);
    Task<bool> ExistsByNameAsync(string name, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<string>> GetNamesByPrefixAsync(string prefix, CancellationToken cancellationToken = default);
    Task<(IEnumerable<Script> Items, int TotalCount)> GetPagedAsync(
        int page, int pageSize,
        IReadOnlyCollection<int>? packIds = null,
        IReadOnlyCollection<int>? projectIds = null,
        IReadOnlyCollection<int>? categoryIds = null,
        string? searchName = null,
        string? language = null,
        CancellationToken cancellationToken = default);
    Task<Script> UpdateAsync(Script script, CancellationToken cancellationToken = default);
    Task DeleteAsync(int id, CancellationToken cancellationToken = default);
}
