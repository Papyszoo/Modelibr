using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Settings;

internal class GetSettingsQueryHandler : IQueryHandler<GetSettingsQuery, GetSettingsQueryResponse>
{
    private readonly IApplicationSettingsRepository _settingsRepository;
    private readonly ISettingRepository _settingRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public GetSettingsQueryHandler(
        IApplicationSettingsRepository settingsRepository,
        ISettingRepository settingRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _settingsRepository = settingsRepository;
        _settingRepository = settingRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<GetSettingsQueryResponse>> Handle(GetSettingsQuery query, CancellationToken cancellationToken)
    {
        var settings = await _settingsRepository.GetAsync(cancellationToken);
        
        // If no settings exist in ApplicationSettings, check the new Settings table
        if (settings == null)
        {
            // Try to read from new Settings table
            var maxFileSizeBytesSetting = await _settingRepository.GetByKeyAsync(SettingKeys.MaxFileSizeBytes, cancellationToken);
            var maxThumbnailSizeBytesSetting = await _settingRepository.GetByKeyAsync(SettingKeys.MaxThumbnailSizeBytes, cancellationToken);
            var thumbnailFrameCountSetting = await _settingRepository.GetByKeyAsync(SettingKeys.ThumbnailFrameCount, cancellationToken);
            var thumbnailCameraVerticalAngleSetting = await _settingRepository.GetByKeyAsync(SettingKeys.ThumbnailCameraVerticalAngle, cancellationToken);
            var thumbnailWidthSetting = await _settingRepository.GetByKeyAsync(SettingKeys.ThumbnailWidth, cancellationToken);
            var thumbnailHeightSetting = await _settingRepository.GetByKeyAsync(SettingKeys.ThumbnailHeight, cancellationToken);
            var generateThumbnailOnUploadSetting = await _settingRepository.GetByKeyAsync(SettingKeys.GenerateThumbnailOnUpload, cancellationToken);

            // If settings exist in new table, use them
            if (maxFileSizeBytesSetting != null)
            {
                var response = new GetSettingsQueryResponse(
                    long.Parse(maxFileSizeBytesSetting.Value),
                    long.Parse(maxThumbnailSizeBytesSetting?.Value ?? "10485760"),
                    int.Parse(thumbnailFrameCountSetting?.Value ?? "30"),
                    double.Parse(thumbnailCameraVerticalAngleSetting?.Value ?? "0.75"),
                    int.Parse(thumbnailWidthSetting?.Value ?? "256"),
                    int.Parse(thumbnailHeightSetting?.Value ?? "256"),
                    bool.Parse(generateThumbnailOnUploadSetting?.Value ?? "true"),
                    30, // Default for CleanRecycledFilesAfterDays
                    maxFileSizeBytesSetting.CreatedAt,
                    maxFileSizeBytesSetting.UpdatedAt
                );
                return Result.Success(response);
            }

            // If no settings exist in either table, create default settings
            settings = Domain.Models.ApplicationSettings.CreateDefault(_dateTimeProvider.UtcNow);
            settings = await _settingsRepository.SaveAsync(settings, cancellationToken);
        }

        var finalResponse = new GetSettingsQueryResponse(
            settings.MaxFileSizeBytes,
            settings.MaxThumbnailSizeBytes,
            settings.ThumbnailFrameCount,
            settings.ThumbnailCameraVerticalAngle,
            settings.ThumbnailWidth,
            settings.ThumbnailHeight,
            settings.GenerateThumbnailOnUpload,
            settings.CleanRecycledFilesAfterDays,
            settings.CreatedAt,
            settings.UpdatedAt
        );

        return Result.Success(finalResponse);
    }
}
