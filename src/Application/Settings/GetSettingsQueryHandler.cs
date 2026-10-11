using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Settings;

internal class GetSettingsQueryHandler : IQueryHandler<GetSettingsQuery, GetSettingsQueryResponse>
{
    private readonly IApplicationSettingsRepository _settingsRepository;
    private readonly ISettingRepository _settingRepository;
    private readonly SettingEnvironmentDefaults _environmentDefaults;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public GetSettingsQueryHandler(
        IApplicationSettingsRepository settingsRepository,
        ISettingRepository settingRepository,
        SettingEnvironmentDefaults environmentDefaults,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _settingsRepository = settingsRepository;
        _settingRepository = settingRepository;
        _environmentDefaults = environmentDefaults;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<GetSettingsQueryResponse>> Handle(GetSettingsQuery query, CancellationToken cancellationToken)
    {
        var settings = await _settingsRepository.GetAsync(cancellationToken);

        // The settings that live only in the key-value table (plus the values
        // resolved from their env fallbacks) are read once and shared by both
        // response shapes below.
        var extended = await ReadExtendedSettingsAsync(cancellationToken);

        // If no settings exist in ApplicationSettings, check the new Settings table
        if (settings == null)
        {
            // Try to read from new Settings table
            var maxFileSizeBytesSetting = await _settingRepository.GetByKeyAsync(SettingKeys.MaxFileSizeBytes, cancellationToken);
            var maxThumbnailSizeBytesSetting = await _settingRepository.GetByKeyAsync(SettingKeys.MaxThumbnailSizeBytes, cancellationToken);
            var thumbnailFrameCountSetting = await _settingRepository.GetByKeyAsync(SettingKeys.ThumbnailFrameCount, cancellationToken);
            var thumbnailSizeSetting = await _settingRepository.GetByKeyAsync(SettingKeys.ThumbnailSize, cancellationToken);
            var generateThumbnailOnUploadSetting = await _settingRepository.GetByKeyAsync(SettingKeys.GenerateThumbnailOnUpload, cancellationToken);
            var generateAnimatedThumbnailSetting = await _settingRepository.GetByKeyAsync(SettingKeys.GenerateAnimatedThumbnail, cancellationToken);

            // If settings exist in new table, use them
            if (maxFileSizeBytesSetting != null)
            {
                var textureProxySizeSetting = await _settingRepository.GetByKeyAsync(SettingKeys.TextureProxySize, cancellationToken);
                var blenderPathSetting = await _settingRepository.GetByKeyAsync(SettingKeys.BlenderPath, cancellationToken);
                var blenderEnabledSetting = await _settingRepository.GetByKeyAsync(SettingKeys.BlenderEnabled, cancellationToken);
                var modelDuplicateNamePolicySetting = await _settingRepository.GetByKeyAsync(SettingKeys.DuplicateNamePolicy, cancellationToken);
                var response = new GetSettingsQueryResponse(
                    long.Parse(maxFileSizeBytesSetting.Value),
                    long.Parse(maxThumbnailSizeBytesSetting?.Value ?? "10485760"),
                    int.Parse(thumbnailFrameCountSetting?.Value ?? "30"),
                    int.Parse(thumbnailSizeSetting?.Value ?? "256"),
                    bool.Parse(generateThumbnailOnUploadSetting?.Value ?? "true"),
                    bool.Parse(generateAnimatedThumbnailSetting?.Value ?? "true"),
                    int.Parse(textureProxySizeSetting?.Value ?? "512"),
                    blenderPathSetting?.Value ?? "blender",
                    bool.Parse(blenderEnabledSetting?.Value ?? "false"),
                    modelDuplicateNamePolicySetting?.Value ?? "Allow",
                    extended.AutoAssignOnImport,
                    extended.CleanRecycledFilesAfterDays,
                    extended.PreMigrationBackupEnabled,
                    extended.PreMigrationBackupRetention,
                    extended.SkipDuplicateThumbnails,
                    extended.McpEnabled,
                    extended.McpWriteEnabled,
                    extended.McpDestructiveEnabled,
                    extended.ThumbnailBackground,
                    extended.BlenderOperationTimeoutMinutes,
                    maxFileSizeBytesSetting.CreatedAt,
                    maxFileSizeBytesSetting.UpdatedAt
                );
                return Result.Success(response);
            }

            // If no settings exist in either table, create default settings.
            // This is a query that writes (pre-existing design: get-or-create
            // defaults) - SaveAsync only stages the new row now that
            // repositories don't self-commit, so it must be followed by an
            // explicit commit or the defaults vanish at the end of the
            // request and every subsequent GetSettings call recreates them
            // in memory without ever persisting them.
            settings = Domain.Models.ApplicationSettings.CreateDefault(_dateTimeProvider.UtcNow);
            settings = await _settingsRepository.SaveAsync(settings, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }

        var finalResponse = new GetSettingsQueryResponse(
            settings.MaxFileSizeBytes,
            settings.MaxThumbnailSizeBytes,
            settings.ThumbnailFrameCount,
            settings.ThumbnailSize,
            settings.GenerateThumbnailOnUpload,
            settings.GenerateAnimatedThumbnail,
            settings.TextureProxySize,
            (await _settingRepository.GetByKeyAsync(SettingKeys.BlenderPath, cancellationToken))?.Value ?? "blender",
            bool.Parse((await _settingRepository.GetByKeyAsync(SettingKeys.BlenderEnabled, cancellationToken))?.Value ?? "false"),
            (await _settingRepository.GetByKeyAsync(SettingKeys.DuplicateNamePolicy, cancellationToken))?.Value ?? "Allow",
            extended.AutoAssignOnImport,
            extended.CleanRecycledFilesAfterDays,
            extended.PreMigrationBackupEnabled,
            extended.PreMigrationBackupRetention,
            extended.SkipDuplicateThumbnails,
            extended.McpEnabled,
            extended.McpWriteEnabled,
            extended.McpDestructiveEnabled,
            extended.ThumbnailBackground,
            extended.BlenderOperationTimeoutMinutes,
            settings.CreatedAt,
            settings.UpdatedAt
        );

        return Result.Success(finalResponse);
    }

    /// <summary>
    /// The settings stored only in the key-value table, resolved for display:
    /// stored value first, env fallback where one exists, then the default.
    /// These are what the Settings page edits; env-wins precedence (MCP, backups)
    /// is applied at the point of use, not here.
    /// </summary>
    private async Task<ExtendedSettings> ReadExtendedSettingsAsync(CancellationToken cancellationToken)
    {
        var rows = await _settingRepository.GetAllAsync(cancellationToken);
        var byKey = rows.ToDictionary(s => s.Key, s => s.Value, StringComparer.Ordinal);

        string? Value(string key) => byKey.GetValueOrDefault(key);

        var blenderTimeoutMinutes =
            SettingResolution.ParsePositiveInt(Value(SettingKeys.BlenderOperationTimeoutMinutes))
            ?? _environmentDefaults.BlenderOperationTimeoutMinutes
            ?? SettingResolution.DefaultBlenderOperationTimeoutMinutes;

        return new ExtendedSettings(
            SettingResolution.ResolveAutoAssignOnImport(Value(SettingKeys.AutoAssignOnImport)),
            SettingResolution.ParseNonNegativeInt(Value(SettingKeys.CleanRecycledFilesAfterDays)) ?? 0,
            SettingResolution.ParseBool(Value(SettingKeys.PreMigrationBackupEnabled)) ?? true,
            SettingResolution.ParsePositiveInt(Value(SettingKeys.PreMigrationBackupRetention)) ?? SettingResolution.DefaultPreMigrationBackupRetention,
            SettingResolution.ResolveBoolStoredThenEnv(
                Value(SettingKeys.SkipDuplicateThumbnails),
                _environmentDefaults.SkipDuplicateThumbnails,
                defaultValue: false),
            SettingResolution.ParseBool(Value(SettingKeys.McpEnabled)) ?? true,
            SettingResolution.ParseBool(Value(SettingKeys.McpWriteEnabled)) ?? false,
            SettingResolution.ParseBool(Value(SettingKeys.McpDestructiveEnabled)) ?? false,
            SettingResolution.ResolveThumbnailBackground(Value(SettingKeys.ThumbnailBackground)),
            blenderTimeoutMinutes);
    }

    private sealed record ExtendedSettings(
        bool AutoAssignOnImport,
        int CleanRecycledFilesAfterDays,
        bool PreMigrationBackupEnabled,
        int PreMigrationBackupRetention,
        bool SkipDuplicateThumbnails,
        bool McpEnabled,
        bool McpWriteEnabled,
        bool McpDestructiveEnabled,
        string ThumbnailBackground,
        int BlenderOperationTimeoutMinutes);
}
