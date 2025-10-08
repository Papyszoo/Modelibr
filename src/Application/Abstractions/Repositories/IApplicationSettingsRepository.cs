using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface IApplicationSettingsRepository
{
    Task<ApplicationSettings?> GetAsync(CancellationToken cancellationToken = default);
    Task<ApplicationSettings> SaveAsync(ApplicationSettings settings, CancellationToken cancellationToken = default);
}
