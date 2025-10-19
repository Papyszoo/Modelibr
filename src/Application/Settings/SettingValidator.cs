using SharedKernel;

namespace Application.Settings;

/// <summary>
/// Validates setting values based on their keys.
/// </summary>
internal static class SettingValidator
{
    public static Result ValidateSetting(string key, string value)
    {
        return key switch
        {
            SettingKeys.MaxFileSizeBytes => ValidateMaxFileSizeBytes(value),
            SettingKeys.MaxThumbnailSizeBytes => ValidateMaxThumbnailSizeBytes(value),
            SettingKeys.ThumbnailFrameCount => ValidateThumbnailFrameCount(value),
            SettingKeys.ThumbnailCameraVerticalAngle => ValidateThumbnailCameraVerticalAngle(value),
            SettingKeys.ThumbnailWidth => ValidateThumbnailWidth(value),
            SettingKeys.ThumbnailHeight => ValidateThumbnailHeight(value),
            SettingKeys.GenerateThumbnailOnUpload => ValidateGenerateThumbnailOnUpload(value),
            _ => Result.Success() // Unknown keys are allowed for extensibility
        };
    }

    private static Result ValidateMaxFileSizeBytes(string value)
    {
        if (!long.TryParse(value, out var sizeBytes))
            return Result.Failure(new Error("InvalidSetting", "MaxFileSizeBytes must be a valid number."));

        if (sizeBytes <= 0)
            return Result.Failure(new Error("InvalidSetting", "File size limit must be greater than 0."));

        // Maximum 10GB limit
        if (sizeBytes > 10_737_418_240)
            return Result.Failure(new Error("InvalidSetting", "File size limit cannot exceed 10GB."));

        return Result.Success();
    }

    private static Result ValidateMaxThumbnailSizeBytes(string value)
    {
        if (!long.TryParse(value, out var sizeBytes))
            return Result.Failure(new Error("InvalidSetting", "MaxThumbnailSizeBytes must be a valid number."));

        if (sizeBytes <= 0)
            return Result.Failure(new Error("InvalidSetting", "Thumbnail size limit must be greater than 0."));

        // Maximum 100MB limit (converted from frontend MB to bytes)
        if (sizeBytes > 104_857_600)
            return Result.Failure(new Error("InvalidSetting", "Thumbnail size limit cannot exceed 100MB."));

        return Result.Success();
    }

    private static Result ValidateThumbnailFrameCount(string value)
    {
        if (!int.TryParse(value, out var frameCount))
            return Result.Failure(new Error("InvalidSetting", "ThumbnailFrameCount must be a valid integer."));

        if (frameCount < 1)
            return Result.Failure(new Error("InvalidSetting", "Frame count must be at least 1."));

        if (frameCount > 360)
            return Result.Failure(new Error("InvalidSetting", "Frame count cannot exceed 360."));

        return Result.Success();
    }

    private static Result ValidateThumbnailCameraVerticalAngle(string value)
    {
        if (!double.TryParse(value, out var angle))
            return Result.Failure(new Error("InvalidSetting", "ThumbnailCameraVerticalAngle must be a valid number."));

        if (angle < 0)
            return Result.Failure(new Error("InvalidSetting", "Camera vertical angle cannot be negative."));

        if (angle > 2)
            return Result.Failure(new Error("InvalidSetting", "Camera vertical angle cannot exceed 2."));

        return Result.Success();
    }

    private static Result ValidateThumbnailWidth(string value)
    {
        if (!int.TryParse(value, out var width))
            return Result.Failure(new Error("InvalidSetting", "ThumbnailWidth must be a valid integer."));

        if (width < 64)
            return Result.Failure(new Error("InvalidSetting", "Thumbnail width must be at least 64 pixels."));

        if (width > 2048)
            return Result.Failure(new Error("InvalidSetting", "Thumbnail width cannot exceed 2048 pixels."));

        return Result.Success();
    }

    private static Result ValidateThumbnailHeight(string value)
    {
        if (!int.TryParse(value, out var height))
            return Result.Failure(new Error("InvalidSetting", "ThumbnailHeight must be a valid integer."));

        if (height < 64)
            return Result.Failure(new Error("InvalidSetting", "Thumbnail height must be at least 64 pixels."));

        if (height > 2048)
            return Result.Failure(new Error("InvalidSetting", "Thumbnail height cannot exceed 2048 pixels."));

        return Result.Success();
    }

    private static Result ValidateGenerateThumbnailOnUpload(string value)
    {
        if (!bool.TryParse(value, out _))
            return Result.Failure(new Error("InvalidSetting", "GenerateThumbnailOnUpload must be 'true' or 'false'."));

        return Result.Success();
    }
}
