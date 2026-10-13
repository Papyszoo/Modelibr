using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Settings;

internal class GetSettingsQueryHandler : IQueryHandler<GetSettingsQuery, GetSettingsQueryResponse>
{
    private readonly ISettingRepository _settingRepository;
    private readonly SettingEnvironmentDefaults _environmentDefaults;
    private readonly IDateTimeProvider _dateTimeProvider;

    public GetSettingsQueryHandler(
        ISettingRepository settingRepository,
        SettingEnvironmentDefaults environmentDefaults,
        IDateTimeProvider dateTimeProvider)
    {
        _settingRepository = settingRepository;
        _environmentDefaults = environmentDefaults;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<GetSettingsQueryResponse>> Handle(GetSettingsQuery query, CancellationToken cancellationToken)
    {
        // The key-value Settings table is the only store. Everything the legacy
        // ApplicationSettings row held is copied into it by the
        // SettingsKeyValueOnly migration; absent keys resolve to defaults here.
        var rows = await _settingRepository.GetAllAsync(cancellationToken);
        var byKey = rows.ToDictionary(s => s.Key, s => s.Value, StringComparer.Ordinal);

        var core = ApplicationSettingsSnapshot.FromSettings(rows, _dateTimeProvider.UtcNow);
        var extended = ReadExtendedSettings(byKey);

        var response = new GetSettingsQueryResponse(
            core.MaxFileSizeBytes,
            core.MaxThumbnailSizeBytes,
            core.ThumbnailFrameCount,
            core.ThumbnailSize,
            core.GenerateThumbnailOnUpload,
            core.GenerateAnimatedThumbnail,
            core.TextureProxySize,
            byKey.GetValueOrDefault(SettingKeys.BlenderPath) ?? "blender",
            bool.Parse(byKey.GetValueOrDefault(SettingKeys.BlenderEnabled) ?? "false"),
            byKey.GetValueOrDefault(SettingKeys.DuplicateNamePolicy) ?? "Allow",
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
            core.CreatedAt,
            core.UpdatedAt);

        return Result.Success(response);
    }

    /// <summary>
    /// The settings resolved for display: stored value first, env fallback where
    /// one exists, then the default. These are what the Settings page edits;
    /// env-wins precedence (MCP, backups) is applied at the point of use, not here.
    /// </summary>
    private ExtendedSettings ReadExtendedSettings(IReadOnlyDictionary<string, string> byKey)
    {
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
