namespace Application.Settings;

/// <summary>
/// Resolves the effective value of a setting that can exist both as a stored
/// <c>Settings</c> row and as an environment variable.
///
/// Two precedences exist, and which one applies is a product decision, not an
/// accident:
/// <list type="bullet">
/// <item><description>
/// <b>Stored wins, env falls back</b> (<see cref="ResolveBoolStoredThenEnv"/>):
/// the setting is the primary source and the env var is what a deployment gets
/// when nobody has chosen a value (duplicate thumbnails, Blender timeout).
/// </description></item>
/// <item><description>
/// <b>Env wins, stored falls back</b> (<see cref="ResolveBoolEnvThenStored"/>):
/// an explicitly set env var overrides the stored setting, which is what keeps
/// existing Docker deployments behaving exactly as their .env says (MCP flags,
/// pre-migration backup).</description></item>
/// </list>
/// </summary>
public static class SettingResolution
{
    public const int DefaultPreMigrationBackupRetention = 3;

    public const int DefaultBlenderOperationTimeoutMinutes = 15;

    public const string TransparentBackground = "transparent";

    /// <summary>True when an env var was explicitly set to something.</summary>
    public static bool IsEnvSet(string? envValue) =>
        !string.IsNullOrWhiteSpace(envValue);

    /// <summary>Parses a stored/env boolean; null when absent or unparsable.</summary>
    public static bool? ParseBool(string? value) =>
        bool.TryParse(value, out var parsed) ? parsed : null;

    /// <summary>
    /// Stored value first, env var as the fallback, then the default.
    /// </summary>
    public static bool ResolveBoolStoredThenEnv(string? storedValue, string? envValue, bool defaultValue) =>
        ParseBool(storedValue) ?? ParseBool(envValue) ?? defaultValue;

    /// <summary>
    /// Stored value first, an already-parsed env fallback (<paramref name="envValue"/>
    /// non-null), then the default.
    /// </summary>
    public static bool ResolveBoolStoredThenEnv(string? storedValue, bool? envValue, bool defaultValue) =>
        ParseBool(storedValue) ?? envValue ?? defaultValue;

    /// <summary>
    /// An explicitly set env var first (<paramref name="envValue"/> non-null),
    /// then the stored value, then the default.
    /// </summary>
    public static bool ResolveBoolEnvThenStored(string? storedValue, bool? envValue, bool defaultValue) =>
        envValue ?? ParseBool(storedValue) ?? defaultValue;

    /// <summary>Parses an integer that may be 0; null when absent, negative or unparsable.</summary>
    public static int? ParseNonNegativeInt(string? value) =>
        int.TryParse(value, out var parsed) && parsed >= 0 ? parsed : null;

    /// <summary>Parses a strictly positive integer; null when absent or out of range.</summary>
    public static int? ParsePositiveInt(string? value) =>
        int.TryParse(value, out var parsed) && parsed > 0 ? parsed : null;

    /// <summary>
    /// Auto-tag on import keeps its historic reading: absent or anything but the
    /// literal <c>"false"</c> means on.
    /// </summary>
    public static bool ResolveAutoAssignOnImport(string? storedValue) =>
        !string.Equals(storedValue, "false", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Whether the pre-migration backup runs. An explicitly set
    /// <c>MODELIBR_SKIP_PREMIGRATION_BACKUP</c> wins (only <c>true</c> skips -
    /// matching the historic <c>GetValue&lt;bool&gt;</c> reading), then the stored
    /// setting, then on.
    /// </summary>
    public static bool ResolvePreMigrationBackupEnabled(string? storedValue, string? skipEnvValue) =>
        ResolveBoolEnvThenStored(
            storedValue,
            IsEnvSet(skipEnvValue) ? !(ParseBool(skipEnvValue) ?? false) : null,
            defaultValue: true);

    /// <summary>
    /// How many pre-migration snapshots to keep. An explicitly set
    /// <c>MODELIBR_PREMIGRATION_BACKUP_RETENTION</c> wins, then the stored
    /// setting, then <see cref="DefaultPreMigrationBackupRetention"/>.
    /// </summary>
    public static int ResolvePreMigrationBackupRetention(string? storedValue, string? envValue) =>
        ParsePositiveInt(envValue)
        ?? ParsePositiveInt(storedValue)
        ?? DefaultPreMigrationBackupRetention;

    /// <summary>A valid thumbnail background is <c>transparent</c> or a <c>#RRGGBB</c> colour.</summary>
    public static bool IsValidThumbnailBackground(string? value) =>
        string.Equals(value, TransparentBackground, StringComparison.OrdinalIgnoreCase) ||
        IsHexColour(value);

    /// <summary>Effective thumbnail background; invalid or absent means transparent.</summary>
    public static string ResolveThumbnailBackground(string? storedValue) =>
        IsValidThumbnailBackground(storedValue)
            ? storedValue!.ToLowerInvariant()
            : TransparentBackground;

    private static bool IsHexColour(string? value) =>
        value is { Length: 7 } &&
        value[0] == '#' &&
        value.Skip(1).All(Uri.IsHexDigit);
}
