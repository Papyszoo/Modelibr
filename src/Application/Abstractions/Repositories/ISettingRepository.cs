using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface ISettingRepository
{
    Task<Setting?> GetByKeyAsync(string key, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Setting>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<Setting> AddAsync(Setting setting, CancellationToken cancellationToken = default);
    Task<Setting> UpdateAsync(Setting setting, CancellationToken cancellationToken = default);
    Task DeleteAsync(string key, CancellationToken cancellationToken = default);
}
