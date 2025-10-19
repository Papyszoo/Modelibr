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
    [InlineData("0", true)] // Min
    [InlineData("0.75", true)] // Default
    [InlineData("1.5", true)] // Mid range
    [InlineData("2", true)] // Max
    [InlineData("-0.1", false)] // Invalid: negative
    [InlineData("2.1", false)] // Invalid: above max
    [InlineData("invalid", false)] // Invalid: not a number
    public void ValidateSetting_ThumbnailCameraVerticalAngle_ValidatesCorrectly(string value, bool shouldSucceed)
    {
        // Act
        var result = SettingValidator.ValidateSetting(SettingKeys.ThumbnailCameraVerticalAngle, value);

        // Assert
        Assert.Equal(shouldSucceed, result.IsSuccess);
    }

    [Theory]
    [InlineData("64", true)] // Min
    [InlineData("256", true)] // Default
    [InlineData("2048", true)] // Max
    [InlineData("63", false)] // Invalid: below min
    [InlineData("2049", false)] // Invalid: above max
    [InlineData("0", false)] // Invalid: zero
    [InlineData("invalid", false)] // Invalid: not a number
    public void ValidateSetting_ThumbnailWidth_ValidatesCorrectly(string value, bool shouldSucceed)
    {
        // Act
        var result = SettingValidator.ValidateSetting(SettingKeys.ThumbnailWidth, value);

        // Assert
        Assert.Equal(shouldSucceed, result.IsSuccess);
    }

    [Theory]
    [InlineData("64", true)] // Min
    [InlineData("256", true)] // Default
    [InlineData("2048", true)] // Max
    [InlineData("63", false)] // Invalid: below min
    [InlineData("2049", false)] // Invalid: above max
    [InlineData("0", false)] // Invalid: zero
    [InlineData("invalid", false)] // Invalid: not a number
    public void ValidateSetting_ThumbnailHeight_ValidatesCorrectly(string value, bool shouldSucceed)
    {
        // Act
        var result = SettingValidator.ValidateSetting(SettingKeys.ThumbnailHeight, value);

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
}
