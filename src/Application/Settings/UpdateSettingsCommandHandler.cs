using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Settings;

internal class UpdateSettingsCommandHandler : ICommandHandler<UpdateSettingsCommand, UpdateSettingsResponse>
{
    private readonly IApplicationSettingsRepository _settingsRepository;
    private readonly ISettingRepository _settingRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateSettingsCommandHandler(
        IApplicationSettingsRepository settingsRepository,
        ISettingRepository settingRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _settingsRepository = settingsRepository;
        _settingRepository = settingRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<UpdateSettingsResponse>> Handle(UpdateSettingsCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var settings = await _settingsRepository.GetAsync(cancellationToken);
            
            // If no settings exist, create default settings first
            if (settings == null)
            {
                settings = Domain.Models.ApplicationSettings.CreateDefault(_dateTimeProvider.UtcNow);
            }

            var now = _dateTimeProvider.UtcNow;

            // Update file size limits
            settings.UpdateFileSizeLimits(
                command.MaxFileSizeBytes,
                command.MaxThumbnailSizeBytes,
                now);

            // Update thumbnail settings
            settings.UpdateThumbnailSettings(
                command.ThumbnailFrameCount,
                command.ThumbnailCameraVerticalAngle,
                command.ThumbnailWidth,
                command.ThumbnailHeight,
                command.GenerateThumbnailOnUpload,
                now);

            var updatedSettings = await _settingsRepository.SaveAsync(settings, cancellationToken);

            // Also update the new Settings table for forward compatibility
            await UpdateOrCreateSettingAsync(SettingKeys.MaxFileSizeBytes, command.MaxFileSizeBytes.ToString(), now, cancellationToken);
            await UpdateOrCreateSettingAsync(SettingKeys.MaxThumbnailSizeBytes, command.MaxThumbnailSizeBytes.ToString(), now, cancellationToken);
            await UpdateOrCreateSettingAsync(SettingKeys.ThumbnailFrameCount, command.ThumbnailFrameCount.ToString(), now, cancellationToken);
            await UpdateOrCreateSettingAsync(SettingKeys.ThumbnailCameraVerticalAngle, command.ThumbnailCameraVerticalAngle.ToString(), now, cancellationToken);
            await UpdateOrCreateSettingAsync(SettingKeys.ThumbnailWidth, command.ThumbnailWidth.ToString(), now, cancellationToken);
            await UpdateOrCreateSettingAsync(SettingKeys.ThumbnailHeight, command.ThumbnailHeight.ToString(), now, cancellationToken);
            await UpdateOrCreateSettingAsync(SettingKeys.GenerateThumbnailOnUpload, command.GenerateThumbnailOnUpload.ToString().ToLower(), now, cancellationToken);

            return Result.Success(new UpdateSettingsResponse(
                updatedSettings.MaxFileSizeBytes,
                updatedSettings.MaxThumbnailSizeBytes,
                updatedSettings.ThumbnailFrameCount,
                updatedSettings.ThumbnailCameraVerticalAngle,
                updatedSettings.ThumbnailWidth,
                updatedSettings.ThumbnailHeight,
                updatedSettings.GenerateThumbnailOnUpload,
                updatedSettings.UpdatedAt
            ));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<UpdateSettingsResponse>(
                new Error("InvalidSettings", ex.Message));
        }
    }

    private async Task UpdateOrCreateSettingAsync(string key, string value, DateTime updatedAt, CancellationToken cancellationToken)
    {
        var setting = await _settingRepository.GetByKeyAsync(key, cancellationToken);
        if (setting == null)
        {
            setting = Setting.Create(key, value, updatedAt);
            await _settingRepository.AddAsync(setting, cancellationToken);
        }
        else
        {
            setting.UpdateValue(value, updatedAt);
            await _settingRepository.UpdateAsync(setting, cancellationToken);
        }
    }
}
