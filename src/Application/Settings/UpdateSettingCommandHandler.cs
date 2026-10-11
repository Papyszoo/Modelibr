using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Settings;

internal class UpdateSettingCommandHandler : ICommandHandler<UpdateSettingCommand, UpdateSettingResponse>
{
    private readonly ISettingRepository _settingRepository;
    private readonly IApplicationSettingsRepository _applicationSettingsRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateSettingCommandHandler(
        ISettingRepository settingRepository,
        IApplicationSettingsRepository applicationSettingsRepository,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _settingRepository = settingRepository;
        _applicationSettingsRepository = applicationSettingsRepository;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<UpdateSettingResponse>> Handle(UpdateSettingCommand command, CancellationToken cancellationToken)
    {
        // Validate the setting value based on its key
        var validationResult = SettingValidator.ValidateSetting(command.Key, command.Value);
        if (validationResult.IsFailure)
        {
            return Result.Failure<UpdateSettingResponse>(validationResult.Error);
        }

        try
        {
            var now = _dateTimeProvider.UtcNow;
            var existingSetting = await _settingRepository.GetByKeyAsync(command.Key, cancellationToken);

            Setting setting;
            if (existingSetting == null)
            {
                setting = Setting.Create(command.Key, command.Value, now);
                await _settingRepository.AddAsync(setting, cancellationToken);
            }
            else
            {
                existingSetting.UpdateValue(command.Value, now);
                setting = await _settingRepository.UpdateAsync(existingSetting, cancellationToken);
            }

            // The recycled-files retention also has a column on ApplicationSettings.
            // The key-value row above is what the purge job reads (its presence is
            // the user's opt-in - the column's old default of 30 was never one), and
            // this keeps the column in sync with the choice.
            if (command.Key == SettingKeys.CleanRecycledFilesAfterDays &&
                int.TryParse(command.Value, out var retentionDays))
            {
                var applicationSettings =
                    await _applicationSettingsRepository.GetAsync(cancellationToken)
                    ?? ApplicationSettings.CreateDefault(now);
                applicationSettings.UpdateCleanRecycledFilesAfterDays(retentionDays, now);
                await _applicationSettingsRepository.SaveAsync(applicationSettings, cancellationToken);
            }

            await _unitOfWork.SaveChangesAsync(cancellationToken);

            return Result.Success(new UpdateSettingResponse(
                setting.Key,
                setting.Value,
                setting.UpdatedAt
            ));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<UpdateSettingResponse>(
                new Error("InvalidSetting", ex.Message));
        }
    }
}
