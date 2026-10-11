using Application.Settings;
using Xunit;

namespace Application.Tests.Settings;

/// <summary>
/// Precedence rules for settings that exist both as a stored key-value row and
/// as an environment variable. Each new setting has exactly one documented
/// precedence, and these tests are what keep a future reader from flipping one.
/// </summary>
public class SettingResolutionTests
{
    // ── Auto-tag on import ──────────────────────────────────────────────

    [Theory]
    [InlineData(null, true)]
    [InlineData("", true)]
    [InlineData("true", true)]
    [InlineData("banana", true)]
    [InlineData("false", false)]
    [InlineData("FALSE", false)]
    public void ResolveAutoAssignOnImport_AnythingButFalse_IsOn(string? stored, bool expected)
    {
        Assert.Equal(expected, SettingResolution.ResolveAutoAssignOnImport(stored));
    }

    // ── Recycled file retention ─────────────────────────────────────────

    [Theory]
    [InlineData(null, null)]
    [InlineData("", null)]
    [InlineData("abc", null)]
    [InlineData("-1", null)]
    [InlineData("0", 0)]
    [InlineData("30", 30)]
    [InlineData("365", 365)]
    public void ParseNonNegativeInt_ReadsRetentionOrNothing(string? value, int? expected)
    {
        Assert.Equal(expected, SettingResolution.ParseNonNegativeInt(value));
    }

    // ── Pre-migration backup: enabled ───────────────────────────────────

    [Fact]
    public void PreMigrationBackup_NoStoredNoEnv_IsEnabled()
    {
        Assert.True(SettingResolution.ResolvePreMigrationBackupEnabled(null, null));
    }

    [Fact]
    public void PreMigrationBackup_StoredDisabled_IsDisabled()
    {
        Assert.False(SettingResolution.ResolvePreMigrationBackupEnabled("false", null));
    }

    [Fact]
    public void PreMigrationBackup_EnvSkipTrue_BeatsStoredEnabled()
    {
        Assert.False(SettingResolution.ResolvePreMigrationBackupEnabled("true", "true"));
    }

    [Fact]
    public void PreMigrationBackup_EnvExplicitlyFalse_BeatsStoredDisabled()
    {
        // Docker forwards MODELIBR_SKIP_PREMIGRATION_BACKUP=false explicitly; that
        // is an operator statement and wins over a stored opt-out.
        Assert.True(SettingResolution.ResolvePreMigrationBackupEnabled("false", "false"));
    }

    [Fact]
    public void PreMigrationBackup_UnparsableEnvSkip_BehavesLikeNotSkipping()
    {
        // Matches the historic GetValue<bool> reading: anything but "true" is false.
        Assert.True(SettingResolution.ResolvePreMigrationBackupEnabled("false", "banana"));
    }

    // ── Pre-migration backup: retention ─────────────────────────────────

    [Fact]
    public void PreMigrationBackupRetention_NoStoredNoEnv_IsDefault()
    {
        Assert.Equal(3, SettingResolution.ResolvePreMigrationBackupRetention(null, null));
    }

    [Fact]
    public void PreMigrationBackupRetention_StoredUsedWhenEnvAbsent()
    {
        Assert.Equal(7, SettingResolution.ResolvePreMigrationBackupRetention("7", null));
    }

    [Fact]
    public void PreMigrationBackupRetention_ExplicitEnvWins()
    {
        Assert.Equal(5, SettingResolution.ResolvePreMigrationBackupRetention("7", "5"));
    }

    [Fact]
    public void PreMigrationBackupRetention_InvalidEnvFallsBackToStored()
    {
        Assert.Equal(7, SettingResolution.ResolvePreMigrationBackupRetention("7", "banana"));
    }

    // ── Duplicate thumbnails: stored wins, env falls back ───────────────

    [Theory]
    [InlineData(null, null, false)]
    [InlineData(null, "true", true)]
    [InlineData(null, "false", false)]
    [InlineData("true", null, true)]
    [InlineData("false", "true", false)]
    [InlineData("true", "false", true)]
    public void SkipDuplicateThumbnails_StoredWinsOverEnv(string? stored, string? env, bool expected)
    {
        Assert.Equal(expected, SettingResolution.ResolveBoolStoredThenEnv(stored, env, defaultValue: false));
    }

    // ── MCP flags: env explicitly set wins ──────────────────────────────

    [Theory]
    [InlineData(null, null, true)]
    [InlineData("false", null, false)]
    [InlineData("true", false, false)]
    [InlineData("false", true, true)]
    public void McpFlags_EnvWinsOverStored(string? stored, bool? env, bool expected)
    {
        Assert.Equal(expected, SettingResolution.ResolveBoolEnvThenStored(stored, env, defaultValue: true));
    }

    // ── Blender operation timeout ───────────────────────────────────────

    [Theory]
    [InlineData(null, null)]
    [InlineData("", null)]
    [InlineData("0", null)]
    [InlineData("-5", null)]
    [InlineData("banana", null)]
    [InlineData("15", 15)]
    [InlineData("240", 240)]
    public void ParsePositiveInt_ReadsTimeoutOrNothing(string? value, int? expected)
    {
        Assert.Equal(expected, SettingResolution.ParsePositiveInt(value));
    }

    // ── Thumbnail background ────────────────────────────────────────────

    [Theory]
    [InlineData(null, "transparent")]
    [InlineData("", "transparent")]
    [InlineData("transparent", "transparent")]
    [InlineData("TRANSPARENT", "transparent")]
    [InlineData("#A1B2C3", "#a1b2c3")]
    [InlineData("#000000", "#000000")]
    [InlineData("red", "transparent")]
    [InlineData("#12345", "transparent")]
    [InlineData("#GGGGGG", "transparent")]
    [InlineData("123456", "transparent")]
    public void ResolveThumbnailBackground_ValidColourOrTransparent(string? stored, string expected)
    {
        Assert.Equal(expected, SettingResolution.ResolveThumbnailBackground(stored));
    }
}
