using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Settings;

internal class UpdateSettingsCommandHandler : ICommandHandler<UpdateSettingsCommand, UpdateSettingsResponse>
{
    private readonly ISettingRepository _settingRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateSettingsCommandHandler(
        ISettingRepository settingRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _settingRepository = settingRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<UpdateSettingsResponse>> Handle(UpdateSettingsCommand command, CancellationToken cancellationToken)
    {
        var updates = new (string Key, string Value)[]
        {
            (SettingKeys.MaxFileSizeBytes, command.MaxFileSizeBytes.ToString()),
            (SettingKeys.MaxThumbnailSizeBytes, command.MaxThumbnailSizeBytes.ToString()),
            (SettingKeys.ThumbnailFrameCount, command.ThumbnailFrameCount.ToString()),
            (SettingKeys.ThumbnailSize, command.ThumbnailSize.ToString()),
            (SettingKeys.GenerateThumbnailOnUpload, command.GenerateThumbnailOnUpload.ToString().ToLower()),
            (SettingKeys.GenerateAnimatedThumbnail, command.GenerateAnimatedThumbnail.ToString().ToLower()),
            (SettingKeys.TextureProxySize, command.TextureProxySize.ToString()),
        };

        // Same validation the per-key endpoint applies, before anything is
        // written, so a rejected save cannot half-apply.
        foreach (var (key, value) in updates)
        {
            var validation = SettingValidator.ValidateSetting(key, value);
            if (validation.IsFailure)
            {
                return Result.Failure<UpdateSettingsResponse>(
                    new Error("InvalidSettings", validation.Error.Message));
            }
        }

        var now = _dateTimeProvider.UtcNow;

        foreach (var (key, value) in updates)
        {
            await UpdateOrCreateSettingAsync(key, value, now, cancellationToken);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(new UpdateSettingsResponse(
            command.MaxFileSizeBytes,
            command.MaxThumbnailSizeBytes,
            command.ThumbnailFrameCount,
            command.ThumbnailSize,
            command.GenerateThumbnailOnUpload,
            command.GenerateAnimatedThumbnail,
            command.TextureProxySize,
            now));
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
