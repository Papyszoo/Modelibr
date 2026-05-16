namespace Domain.Models;

/// <summary>
/// Represents application-wide settings that can be configured at runtime.
/// </summary>
public class ApplicationSettings : AggregateRoot
{
    public int Id { get; private set; }

    // File upload settings
    public long MaxFileSizeBytes { get; private set; }
    public long MaxThumbnailSizeBytes { get; private set; }

    // Thumbnail generation settings
    public int ThumbnailFrameCount { get; private set; }
    /// <summary>
    /// Square side length in pixels for rendered thumbnails.
    /// Allowed values: 64, 128, 256, 512, 1024, 2048.
    /// </summary>
    public int ThumbnailSize { get; private set; }
    public bool GenerateThumbnailOnUpload { get; private set; }
    public bool GenerateAnimatedThumbnail { get; private set; }

    // Soft delete settings
    public int CleanRecycledFilesAfterDays { get; private set; }

    // Texture proxy settings
    /// <summary>
    /// Square side length for generated texture proxies (256, 512, 1024, 2048). Default: 512.
    /// </summary>
    public int TextureProxySize { get; private set; }

    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    // Private constructor for EF Core
    private ApplicationSettings() { }

    /// <summary>
    /// Creates application settings with default values.
    /// </summary>
    public static ApplicationSettings CreateDefault(DateTime createdAt)
    {
        return new ApplicationSettings
        {
            MaxFileSizeBytes = 1_073_741_824, // 1GB
            MaxThumbnailSizeBytes = 10_485_760, // 10MB
            ThumbnailFrameCount = 30, // Default: 360/12 = 30 frames
            ThumbnailSize = 256,
            GenerateThumbnailOnUpload = true, // Generate thumbnails by default
            GenerateAnimatedThumbnail = true, // Generate animated (multi-frame orbit) thumbnails by default
            CleanRecycledFilesAfterDays = 30, // Default: 30 days
            TextureProxySize = 512, // Default: 512px square
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };
    }

    /// <summary>
    /// Updates file size limits.
    /// </summary>
    public void UpdateFileSizeLimits(long maxFileSizeBytes, long maxThumbnailSizeBytes, DateTime updatedAt)
    {
        ValidateFileSizeLimit(maxFileSizeBytes, nameof(maxFileSizeBytes));
        ValidateFileSizeLimit(maxThumbnailSizeBytes, nameof(maxThumbnailSizeBytes));

        MaxFileSizeBytes = maxFileSizeBytes;
        MaxThumbnailSizeBytes = maxThumbnailSizeBytes;
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Updates thumbnail generation settings.
    /// </summary>
    public void UpdateThumbnailSettings(
        int frameCount,
        int size,
        bool generateOnUpload,
        bool generateAnimated,
        DateTime updatedAt)
    {
        ValidateFrameCount(frameCount);
        ValidateThumbnailSize(size);

        ThumbnailFrameCount = frameCount;
        ThumbnailSize = size;
        GenerateThumbnailOnUpload = generateOnUpload;
        GenerateAnimatedThumbnail = generateAnimated;
        UpdatedAt = updatedAt;
    }

    private static void ValidateFileSizeLimit(long sizeBytes, string paramName)
    {
        if (sizeBytes <= 0)
            throw new ArgumentException("File size limit must be greater than 0.", paramName);

        // Maximum 10GB limit
        if (sizeBytes > 10_737_418_240)
            throw new ArgumentException("File size limit cannot exceed 10GB.", paramName);
    }

    private static void ValidateFrameCount(int frameCount)
    {
        if (frameCount < 1)
            throw new ArgumentException("Frame count must be at least 1.", nameof(frameCount));

        if (frameCount > 360)
            throw new ArgumentException("Frame count cannot exceed 360.", nameof(frameCount));
    }

    private static void ValidateThumbnailSize(int size)
    {
        if (size is not (64 or 128 or 256 or 512 or 1024 or 2048))
            throw new ArgumentException(
                "Thumbnail size must be one of: 64, 128, 256, 512, 1024, 2048.",
                nameof(size));
    }

    /// <summary>
    /// Updates the recycled files cleanup setting.
    /// </summary>
    public void UpdateCleanRecycledFilesAfterDays(int days, DateTime updatedAt)
    {
        if (days < 1)
            throw new ArgumentException("Clean recycled files after days must be at least 1.", nameof(days));

        if (days > 365)
            throw new ArgumentException("Clean recycled files after days cannot exceed 365.", nameof(days));

        CleanRecycledFilesAfterDays = days;
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Updates the texture proxy size setting.
    /// </summary>
    public void UpdateTextureProxySize(int size, DateTime updatedAt)
    {
        if (size is not (256 or 512 or 1024 or 2048))
            throw new ArgumentException("Texture proxy size must be one of: 256, 512, 1024, 2048.", nameof(size));

        TextureProxySize = size;
        UpdatedAt = updatedAt;
    }

}
