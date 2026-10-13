using Application.Abstractions.Repositories;
using Domain.Services;

namespace Application.Settings;

public interface ISettingsService
{
    Task<ApplicationSettingsSnapshot> GetSettingsAsync(CancellationToken cancellationToken = default);
}

internal class SettingsService : ISettingsService
{
    private readonly ISettingRepository _settingRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public SettingsService(
        ISettingRepository settingRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _settingRepository = settingRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<ApplicationSettingsSnapshot> GetSettingsAsync(CancellationToken cancellationToken = default)
    {
        var settings = await _settingRepository.GetAllAsync(cancellationToken);
        return ApplicationSettingsSnapshot.FromSettings(settings, _dateTimeProvider.UtcNow);
    }
}
