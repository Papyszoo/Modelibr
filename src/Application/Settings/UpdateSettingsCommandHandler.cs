using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Settings;

internal class UpdateSettingsCommandHandler : ICommandHandler<UpdateSettingsCommand, UpdateSettingsResponse>
{
    private readonly IApplicationSettingsRepository _settingsRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateSettingsCommandHandler(
        IApplicationSettingsRepository settingsRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _settingsRepository = settingsRepository;
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
}
