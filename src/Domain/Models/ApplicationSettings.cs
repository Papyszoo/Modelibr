namespace Domain.Models;

/// <summary>
/// Represents application-wide settings that can be configured at runtime.
/// </summary>
public class ApplicationSettings : AggregateRoot
{
    public int Id { get; set; }

    // File upload settings
    public long MaxFileSizeBytes { get; private set; }
    public long MaxThumbnailSizeBytes { get; private set; }

    // Thumbnail generation settings
    public int ThumbnailFrameCount { get; private set; }
    public double ThumbnailCameraVerticalAngle { get; private set; }
    public int ThumbnailWidth { get; private set; }
    public int ThumbnailHeight { get; private set; }

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
            ThumbnailCameraVerticalAngle = 0.75, // Default camera height multiplier
            ThumbnailWidth = 256,
            ThumbnailHeight = 256,
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
        double cameraVerticalAngle,
        int width,
        int height,
        DateTime updatedAt)
    {
        ValidateFrameCount(frameCount);
        ValidateCameraVerticalAngle(cameraVerticalAngle);
        ValidateThumbnailDimensions(width, height);

        ThumbnailFrameCount = frameCount;
        ThumbnailCameraVerticalAngle = cameraVerticalAngle;
        ThumbnailWidth = width;
        ThumbnailHeight = height;
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

    private static void ValidateCameraVerticalAngle(double angle)
    {
        if (angle < 0)
            throw new ArgumentException("Camera vertical angle cannot be negative.", nameof(angle));

        if (angle > 2)
            throw new ArgumentException("Camera vertical angle cannot exceed 2.", nameof(angle));
    }

    private static void ValidateThumbnailDimensions(int width, int height)
    {
        if (width < 64 || width > 2048)
            throw new ArgumentException("Thumbnail width must be between 64 and 2048 pixels.", nameof(width));

        if (height < 64 || height > 2048)
            throw new ArgumentException("Thumbnail height must be between 64 and 2048 pixels.", nameof(height));
    }
}
