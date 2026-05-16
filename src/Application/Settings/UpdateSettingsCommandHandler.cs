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
                command.ThumbnailSize,
                command.GenerateThumbnailOnUpload,
                command.GenerateAnimatedThumbnail,
                now);

            // Update texture proxy size
            settings.UpdateTextureProxySize(command.TextureProxySize, now);

            var updatedSettings = await _settingsRepository.SaveAsync(settings, cancellationToken);

            // Also update the new Settings table for forward compatibility
            await UpdateOrCreateSettingAsync(SettingKeys.MaxFileSizeBytes, command.MaxFileSizeBytes.ToString(), now, cancellationToken);
            await UpdateOrCreateSettingAsync(SettingKeys.MaxThumbnailSizeBytes, command.MaxThumbnailSizeBytes.ToString(), now, cancellationToken);
            await UpdateOrCreateSettingAsync(SettingKeys.ThumbnailFrameCount, command.ThumbnailFrameCount.ToString(), now, cancellationToken);
            await UpdateOrCreateSettingAsync(SettingKeys.ThumbnailSize, command.ThumbnailSize.ToString(), now, cancellationToken);
            await UpdateOrCreateSettingAsync(SettingKeys.GenerateThumbnailOnUpload, command.GenerateThumbnailOnUpload.ToString().ToLower(), now, cancellationToken);
            await UpdateOrCreateSettingAsync(SettingKeys.GenerateAnimatedThumbnail, command.GenerateAnimatedThumbnail.ToString().ToLower(), now, cancellationToken);
            await UpdateOrCreateSettingAsync(SettingKeys.TextureProxySize, command.TextureProxySize.ToString(), now, cancellationToken);

            return Result.Success(new UpdateSettingsResponse(
                updatedSettings.MaxFileSizeBytes,
                updatedSettings.MaxThumbnailSizeBytes,
                updatedSettings.ThumbnailFrameCount,
                updatedSettings.ThumbnailSize,
                updatedSettings.GenerateThumbnailOnUpload,
                updatedSettings.GenerateAnimatedThumbnail,
                updatedSettings.TextureProxySize,
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
