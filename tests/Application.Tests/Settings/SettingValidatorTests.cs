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
    [InlineData("reject", false)]
    [InlineData("autorename", false)]
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
}
