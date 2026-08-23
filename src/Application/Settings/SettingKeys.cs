namespace Application.Settings;

/// <summary>
/// Well-known setting keys used in the application.
/// </summary>
public static class SettingKeys
{
    public const string MaxFileSizeBytes = "MaxFileSizeBytes";
    public const string MaxThumbnailSizeBytes = "MaxThumbnailSizeBytes";
    public const string ThumbnailFrameCount = "ThumbnailFrameCount";
    public const string ThumbnailSize = "ThumbnailSize";
    public const string GenerateThumbnailOnUpload = "GenerateThumbnailOnUpload";
    public const string GenerateAnimatedThumbnail = "GenerateAnimatedThumbnail";
    public const string TextureProxySize = "TextureProxySize";
    public const string BlenderPath = "BlenderPath";
    public const string BlenderEnabled = "BlenderEnabled";
    public const string BlenderInstallVersion = "BlenderInstallVersion";
    public const string DuplicateNamePolicy = "DuplicateNamePolicy";

    /// <summary>
    /// Whether an import classifies itself - a category from the asset's name and
    /// surroundings, tags from its folder. Absent or anything but <c>"false"</c> means on:
    /// the automation only ever suggests, and everything it does is reviewable.
    /// </summary>
    public const string AutoAssignOnImport = "AutoAssignOnImport";
}
