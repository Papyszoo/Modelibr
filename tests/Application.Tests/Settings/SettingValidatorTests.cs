using Application.Settings;
using Xunit;

namespace Application.Tests.Settings;

public class SettingValidatorTests
{
    [Theory]
    [InlineData("1048576", true)] // 1MB
    [InlineData("10737418240", true)] // 10GB (max)
    [InlineData("1", true)] // 1 byte (min)
    [InlineData("0", false)] // Invalid: 0
    [InlineData("-1", false)] // Invalid: negative
    [InlineData("10737418241", false)] // Invalid: exceeds 10GB
    [InlineData("invalid", false)] // Invalid: not a number
    public void ValidateSetting_MaxFileSizeBytes_ValidatesCorrectly(string value, bool shouldSucceed)
    {
        // Act
        var result = SettingValidator.ValidateSetting(SettingKeys.MaxFileSizeBytes, value);

        // Assert
        Assert.Equal(shouldSucceed, result.IsSuccess);
    }

    [Theory]
    [InlineData("1048576", true)] // 1MB
    [InlineData("104857600", true)] // 100MB (max)
    [InlineData("1", true)] // 1 byte (min)
    [InlineData("0", false)] // Invalid: 0
    [InlineData("-1", false)] // Invalid: negative
    [InlineData("104857601", false)] // Invalid: exceeds 100MB
    [InlineData("invalid", false)] // Invalid: not a number
    public void ValidateSetting_MaxThumbnailSizeBytes_ValidatesCorrectly(string value, bool shouldSucceed)
    {
        // Act
        var result = SettingValidator.ValidateSetting(SettingKeys.MaxThumbnailSizeBytes, value);

        // Assert
        Assert.Equal(shouldSucceed, result.IsSuccess);
    }

    [Theory]
    [InlineData("1", true)] // Min
    [InlineData("30", true)] // Default
    [InlineData("360", true)] // Max
    [InlineData("0", false)] // Invalid: below min
    [InlineData("361", false)] // Invalid: above max
    [InlineData("-1", false)] // Invalid: negative
    [InlineData("invalid", false)] // Invalid: not a number
    public void ValidateSetting_ThumbnailFrameCount_ValidatesCorrectly(string value, bool shouldSucceed)
    {
        // Act
        var result = SettingValidator.ValidateSetting(SettingKeys.ThumbnailFrameCount, value);

        // Assert
        Assert.Equal(shouldSucceed, result.IsSuccess);
    }

    [Theory]
    [InlineData("64", true)]
    [InlineData("128", true)]
    [InlineData("256", true)] // Default
    [InlineData("512", true)]
    [InlineData("1024", true)]
    [InlineData("2048", true)]
    [InlineData("100", false)] // Not in allowed set
    [InlineData("4096", false)] // Above allowed
    [InlineData("0", false)] // Zero
    [InlineData("invalid", false)] // Not a number
    public void ValidateSetting_ThumbnailSize_ValidatesCorrectly(string value, bool shouldSucceed)
    {
        // Act
        var result = SettingValidator.ValidateSetting(SettingKeys.ThumbnailSize, value);

        // Assert
        Assert.Equal(shouldSucceed, result.IsSuccess);
    }

    [Theory]
    [InlineData("true", true)]
    [InlineData("false", true)]
    [InlineData("True", true)]
    [InlineData("False", true)]
    [InlineData("invalid", false)]
    [InlineData("1", false)]
    [InlineData("0", false)]
    public void ValidateSetting_GenerateThumbnailOnUpload_ValidatesCorrectly(string value, bool shouldSucceed)
    {
        // Act
        var result = SettingValidator.ValidateSetting(SettingKeys.GenerateThumbnailOnUpload, value);

        // Assert
        Assert.Equal(shouldSucceed, result.IsSuccess);
    }

    [Fact]
    public void ValidateSetting_UnknownKey_ReturnsSuccess()
    {
        // Act
        var result = SettingValidator.ValidateSetting("UnknownKey", "anyvalue");

        // Assert
        Assert.True(result.IsSuccess);
    }

    [Theory]
    [InlineData("Reject", true)]
    [InlineData("AutoRename", true)]
    [InlineData("Allow", true)]
    [InlineData("reject", false)]
    [InlineData("autorename", false)]
    [InlineData("allow", false)]
    [InlineData("REJECT", false)]
    [InlineData("invalid", false)]
    [InlineData("true", false)]
    [InlineData("false", false)]
    public void ValidateSetting_ModelDuplicateNamePolicy_ValidatesCorrectly(string value, bool shouldSucceed)
    {
        // Act
        var result = SettingValidator.ValidateSetting(SettingKeys.DuplicateNamePolicy, value);

        // Assert
        Assert.Equal(shouldSucceed, result.IsSuccess);
    }

    [Theory]
    [InlineData("0", true)] // Never
    [InlineData("30", true)]
    [InlineData("365", true)] // Max
    [InlineData("-1", false)]
    [InlineData("366", false)]
    [InlineData("invalid", false)]
    public void ValidateSetting_CleanRecycledFilesAfterDays_ValidatesCorrectly(string value, bool shouldSucceed)
    {
        var result = SettingValidator.ValidateSetting(SettingKeys.CleanRecycledFilesAfterDays, value);

        Assert.Equal(shouldSucceed, result.IsSuccess);
    }

    [Theory]
    [InlineData("1", true)]
    [InlineData("3", true)]
    [InlineData("10", true)] // Max
    [InlineData("0", false)]
    [InlineData("11", false)]
    [InlineData("invalid", false)]
    public void ValidateSetting_PreMigrationBackupRetention_ValidatesCorrectly(string value, bool shouldSucceed)
    {
        var result = SettingValidator.ValidateSetting(SettingKeys.PreMigrationBackupRetention, value);

        Assert.Equal(shouldSucceed, result.IsSuccess);
    }

    [Theory]
    [InlineData("transparent", true)]
    [InlineData("TRANSPARENT", true)]
    [InlineData("#ffffff", true)]
    [InlineData("#A1B2C3", true)]
    [InlineData("white", false)]
    [InlineData("#fff", false)]
    [InlineData("#gggggg", false)]
    [InlineData("", false)]
    public void ValidateSetting_ThumbnailBackground_ValidatesCorrectly(string value, bool shouldSucceed)
    {
        var result = SettingValidator.ValidateSetting(SettingKeys.ThumbnailBackground, value);

        Assert.Equal(shouldSucceed, result.IsSuccess);
    }

    [Theory]
    [InlineData("1", true)] // Min
    [InlineData("15", true)] // Default
    [InlineData("240", true)] // Max
    [InlineData("0", false)]
    [InlineData("241", false)]
    [InlineData("invalid", false)]
    public void ValidateSetting_BlenderOperationTimeoutMinutes_ValidatesCorrectly(string value, bool shouldSucceed)
    {
        var result = SettingValidator.ValidateSetting(SettingKeys.BlenderOperationTimeoutMinutes, value);

        Assert.Equal(shouldSucceed, result.IsSuccess);
    }

    [Theory]
    [InlineData(SettingKeys.AutoAssignOnImport)]
    [InlineData(SettingKeys.PreMigrationBackupEnabled)]
    [InlineData(SettingKeys.SkipDuplicateThumbnails)]
    [InlineData(SettingKeys.McpEnabled)]
    [InlineData(SettingKeys.McpWriteEnabled)]
    [InlineData(SettingKeys.McpDestructiveEnabled)]
    public void ValidateSetting_NewBooleanKeys_AcceptTrueFalseOnly(string key)
    {
        Assert.True(SettingValidator.ValidateSetting(key, "true").IsSuccess);
        Assert.True(SettingValidator.ValidateSetting(key, "false").IsSuccess);
        Assert.True(SettingValidator.ValidateSetting(key, "True").IsSuccess);
        Assert.False(SettingValidator.ValidateSetting(key, "yes").IsSuccess);
        Assert.False(SettingValidator.ValidateSetting(key, "1").IsSuccess);
    }
}
