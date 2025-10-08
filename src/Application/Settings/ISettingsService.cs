using Application.Abstractions.Repositories;
using Domain.Services;

namespace Application.Settings;

public interface ISettingsService
{
    Task<Domain.Models.ApplicationSettings> GetSettingsAsync(CancellationToken cancellationToken = default);
}

internal class SettingsService : ISettingsService
{
    private readonly IApplicationSettingsRepository _settingsRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public SettingsService(
        IApplicationSettingsRepository settingsRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _settingsRepository = settingsRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Domain.Models.ApplicationSettings> GetSettingsAsync(CancellationToken cancellationToken = default)
    {
        var settings = await _settingsRepository.GetAsync(cancellationToken);
        
        // If no settings exist, create and save default settings
        if (settings == null)
        {
            settings = Domain.Models.ApplicationSettings.CreateDefault(_dateTimeProvider.UtcNow);
            settings = await _settingsRepository.SaveAsync(settings, cancellationToken);
        }

        return settings;
    }
}
