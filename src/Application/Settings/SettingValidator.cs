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
            SettingKeys.ThumbnailSize => ValidateThumbnailSize(value),
            SettingKeys.GenerateThumbnailOnUpload => ValidateGenerateThumbnailOnUpload(value),
            SettingKeys.GenerateAnimatedThumbnail => ValidateGenerateAnimatedThumbnail(value),
            SettingKeys.TextureProxySize => ValidateTextureProxySize(value),
            SettingKeys.BlenderPath => ValidateBlenderPath(value),
            SettingKeys.BlenderEnabled => ValidateBlenderEnabled(value),
            SettingKeys.DuplicateNamePolicy => ValidateDuplicateNamePolicy(value),
            SettingKeys.AutoAssignOnImport => ValidateBoolean(value, SettingKeys.AutoAssignOnImport),
            SettingKeys.CleanRecycledFilesAfterDays => ValidateCleanRecycledFilesAfterDays(value),
            SettingKeys.PreMigrationBackupEnabled => ValidateBoolean(value, SettingKeys.PreMigrationBackupEnabled),
            SettingKeys.PreMigrationBackupRetention => ValidatePreMigrationBackupRetention(value),
            SettingKeys.SkipDuplicateThumbnails => ValidateBoolean(value, SettingKeys.SkipDuplicateThumbnails),
            SettingKeys.McpEnabled => ValidateBoolean(value, SettingKeys.McpEnabled),
            SettingKeys.McpWriteEnabled => ValidateBoolean(value, SettingKeys.McpWriteEnabled),
            SettingKeys.McpDestructiveEnabled => ValidateBoolean(value, SettingKeys.McpDestructiveEnabled),
            SettingKeys.ThumbnailBackground => ValidateThumbnailBackground(value),
            SettingKeys.BlenderOperationTimeoutMinutes => ValidateBlenderOperationTimeoutMinutes(value),
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

    private static Result ValidateThumbnailSize(string value)
    {
        if (!int.TryParse(value, out var size))
            return Result.Failure(new Error("InvalidSetting", "ThumbnailSize must be a valid integer."));

        if (size is not (64 or 128 or 256 or 512 or 1024 or 2048))
            return Result.Failure(new Error("InvalidSetting", "ThumbnailSize must be one of: 64, 128, 256, 512, 1024, 2048."));

        return Result.Success();
    }

    private static Result ValidateGenerateThumbnailOnUpload(string value)
    {
        if (!bool.TryParse(value, out _))
            return Result.Failure(new Error("InvalidSetting", "GenerateThumbnailOnUpload must be 'true' or 'false'."));

        return Result.Success();
    }

    private static Result ValidateGenerateAnimatedThumbnail(string value)
    {
        if (!bool.TryParse(value, out _))
            return Result.Failure(new Error("InvalidSetting", "GenerateAnimatedThumbnail must be 'true' or 'false'."));

        return Result.Success();
    }

    private static Result ValidateTextureProxySize(string value)
    {
        if (!int.TryParse(value, out var size))
            return Result.Failure(new Error("InvalidSetting", "TextureProxySize must be a valid integer."));

        if (size is not (256 or 512 or 1024 or 2048))
            return Result.Failure(new Error("InvalidSetting", "TextureProxySize must be one of: 256, 512, 1024, 2048."));

        return Result.Success();
    }

    private static Result ValidateBlenderPath(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return Result.Failure(new Error("InvalidSetting", "BlenderPath cannot be empty."));

        if (value.Length > 500)
            return Result.Failure(new Error("InvalidSetting", "BlenderPath cannot exceed 500 characters."));

        return Result.Success();
    }

    private static Result ValidateBlenderEnabled(string value)
    {
        if (!bool.TryParse(value, out _))
            return Result.Failure(new Error("InvalidSetting", "BlenderEnabled must be 'true' or 'false'."));

        return Result.Success();
    }

    private static Result ValidateDuplicateNamePolicy(string value)
    {
        if (value is not ("Reject" or "AutoRename" or "Allow"))
            return Result.Failure(new Error("InvalidSetting", "DuplicateNamePolicy must be 'Reject', 'AutoRename', or 'Allow'."));

        return Result.Success();
    }

    private static Result ValidateBoolean(string value, string key)
    {
        if (!bool.TryParse(value, out _))
            return Result.Failure(new Error("InvalidSetting", $"{key} must be 'true' or 'false'."));

        return Result.Success();
    }

    private static Result ValidateCleanRecycledFilesAfterDays(string value)
    {
        if (!int.TryParse(value, out var days))
            return Result.Failure(new Error("InvalidSetting", "CleanRecycledFilesAfterDays must be a valid integer."));

        if (days < 0)
            return Result.Failure(new Error("InvalidSetting", "Recycled file retention must be 0 (never) or a number of days."));

        if (days > 365)
            return Result.Failure(new Error("InvalidSetting", "Recycled file retention cannot exceed 365 days."));

        return Result.Success();
    }

    private static Result ValidatePreMigrationBackupRetention(string value)
    {
        if (!int.TryParse(value, out var count))
            return Result.Failure(new Error("InvalidSetting", "PreMigrationBackupRetention must be a valid integer."));

        if (count < 1)
            return Result.Failure(new Error("InvalidSetting", "Pre-migration backup retention must be at least 1."));

        if (count > 10)
            return Result.Failure(new Error("InvalidSetting", "Pre-migration backup retention cannot exceed 10."));

        return Result.Success();
    }

    private static Result ValidateThumbnailBackground(string value)
    {
        if (!SettingResolution.IsValidThumbnailBackground(value))
            return Result.Failure(new Error("InvalidSetting", "ThumbnailBackground must be 'transparent' or a #RRGGBB colour."));

        return Result.Success();
    }

    private static Result ValidateBlenderOperationTimeoutMinutes(string value)
    {
        if (!int.TryParse(value, out var minutes))
            return Result.Failure(new Error("InvalidSetting", "BlenderOperationTimeoutMinutes must be a valid integer."));

        if (minutes < 1)
            return Result.Failure(new Error("InvalidSetting", "Blender operation timeout must be at least 1 minute."));

        if (minutes > 240)
            return Result.Failure(new Error("InvalidSetting", "Blender operation timeout cannot exceed 240 minutes."));

        return Result.Success();
    }
}
