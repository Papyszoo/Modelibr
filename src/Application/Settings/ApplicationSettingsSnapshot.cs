using Domain.Models;

namespace Application.Settings;

/// <summary>
/// The core application settings - file-size limits, thumbnail generation and
/// texture-proxy size - read from the key-value <c>Settings</c> table.
///
/// These values used to live in the singleton <c>ApplicationSettings</c> row,
/// which duplicated them into the key-value table; the key-value table is now
/// the only store. Absent keys resolve to the same defaults the row was created
/// with, so a database that never stored one reads exactly as before.
/// </summary>
public sealed record ApplicationSettingsSnapshot(
    long MaxFileSizeBytes,
    long MaxThumbnailSizeBytes,
    int ThumbnailFrameCount,
    int ThumbnailSize,
    bool GenerateThumbnailOnUpload,
    bool GenerateAnimatedThumbnail,
    int TextureProxySize,
    DateTime CreatedAt,
    DateTime UpdatedAt)
{
    private const long DefaultMaxFileSizeBytes = 1_073_741_824; // 1GB
    private const long DefaultMaxThumbnailSizeBytes = 10_485_760; // 10MB
    private const int DefaultThumbnailFrameCount = 30;
    private const int DefaultThumbnailSize = 256;
    private const bool DefaultGenerateThumbnailOnUpload = true;
    private const bool DefaultGenerateAnimatedThumbnail = true;
    private const int DefaultTextureProxySize = 512;

    /// <summary>The key-value keys the old ApplicationSettings row held.</summary>
    public static readonly IReadOnlyList<string> CoreKeys =
    [
        SettingKeys.MaxFileSizeBytes,
        SettingKeys.MaxThumbnailSizeBytes,
        SettingKeys.ThumbnailFrameCount,
        SettingKeys.ThumbnailSize,
        SettingKeys.GenerateThumbnailOnUpload,
        SettingKeys.GenerateAnimatedThumbnail,
        SettingKeys.TextureProxySize,
    ];

    /// <summary>All defaults, timestamped at creation - the snapshot of a database with no stored settings.</summary>
    public static ApplicationSettingsSnapshot CreateDefault(DateTime createdAt) =>
        new(
            DefaultMaxFileSizeBytes,
            DefaultMaxThumbnailSizeBytes,
            DefaultThumbnailFrameCount,
            DefaultThumbnailSize,
            DefaultGenerateThumbnailOnUpload,
            DefaultGenerateAnimatedThumbnail,
            DefaultTextureProxySize,
            createdAt,
            createdAt);

    /// <summary>
    /// Builds the snapshot from the key-value rows. An absent or unparsable value
    /// means the default; timestamps come from the core rows the old
    /// ApplicationSettings row became, or <paramref name="now"/> when none exist.
    /// </summary>
    public static ApplicationSettingsSnapshot FromSettings(
        IReadOnlyCollection<Setting> settings,
        DateTime now)
    {
        var byKey = settings.ToDictionary(s => s.Key, s => s.Value, StringComparer.Ordinal);
        string? Value(string key) => byKey.GetValueOrDefault(key);

        var core = settings.Where(s => CoreKeys.Contains(s.Key, StringComparer.Ordinal)).ToList();

        return new ApplicationSettingsSnapshot(
            ParseLong(Value(SettingKeys.MaxFileSizeBytes), DefaultMaxFileSizeBytes),
            ParseLong(Value(SettingKeys.MaxThumbnailSizeBytes), DefaultMaxThumbnailSizeBytes),
            ParseInt(Value(SettingKeys.ThumbnailFrameCount), DefaultThumbnailFrameCount),
            ParseInt(Value(SettingKeys.ThumbnailSize), DefaultThumbnailSize),
            ParseBool(Value(SettingKeys.GenerateThumbnailOnUpload), DefaultGenerateThumbnailOnUpload),
            ParseBool(Value(SettingKeys.GenerateAnimatedThumbnail), DefaultGenerateAnimatedThumbnail),
            ParseInt(Value(SettingKeys.TextureProxySize), DefaultTextureProxySize),
            core.Count == 0 ? now : core.Min(s => s.CreatedAt),
            core.Count == 0 ? now : core.Max(s => s.UpdatedAt));
    }

    private static long ParseLong(string? value, long fallback) =>
        long.TryParse(value, out var parsed) ? parsed : fallback;

    private static int ParseInt(string? value, int fallback) =>
        int.TryParse(value, out var parsed) ? parsed : fallback;

    private static bool ParseBool(string? value, bool fallback) =>
        bool.TryParse(value, out var parsed) ? parsed : fallback;
}
