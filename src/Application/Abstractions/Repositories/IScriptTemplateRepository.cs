using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IScriptTemplateRepository
{
    Task<ScriptTemplate> AddAsync(ScriptTemplate template, CancellationToken cancellationToken = default);
    Task<IEnumerable<ScriptTemplate>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<ScriptTemplate?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<ScriptTemplate> UpdateAsync(ScriptTemplate template, CancellationToken cancellationToken = default);
    Task DeleteAsync(int id, CancellationToken cancellationToken = default);
}
