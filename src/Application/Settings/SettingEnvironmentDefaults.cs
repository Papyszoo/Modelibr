namespace Application.Settings;

/// <summary>
/// Environment variables that act as fallbacks for stored settings whose
/// precedence is "stored value wins, env falls back" - the setting is the
/// primary source, and the env var is what a deployment gets before anyone has
/// chosen a value.
///
/// Read once from configuration in Infrastructure and registered as a singleton
/// (the same pattern as the Derivation options), so Application code never
/// reaches for the process environment directly.
/// </summary>
public sealed record SettingEnvironmentDefaults(
    bool? SkipDuplicateThumbnails,
    int? BlenderOperationTimeoutMs)
{
    /// <summary>No env fallbacks configured - stored values and defaults only.</summary>
    public static readonly SettingEnvironmentDefaults None = new(null, null);

    /// <summary>
    /// Reads the two env fallbacks; a value that is not a valid boolean or
    /// positive integer is treated as unset.
    /// </summary>
    public static SettingEnvironmentDefaults FromValues(string? skipDuplicateThumbnails, string? blenderOperationTimeoutMs) =>
        new(
            SettingResolution.ParseBool(skipDuplicateThumbnails),
            SettingResolution.ParsePositiveInt(blenderOperationTimeoutMs));

    /// <summary>Minutes form of <see cref="BlenderOperationTimeoutMs"/>, for display.</summary>
    public int? BlenderOperationTimeoutMinutes =>
        BlenderOperationTimeoutMs is null
            ? null
            : (int)Math.Round(BlenderOperationTimeoutMs.Value / 60000d);
}
