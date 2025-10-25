using Application.Abstractions.Messaging;

namespace Application.Settings;

public record UpdateSettingsCommand(
    long MaxFileSizeBytes,
    long MaxThumbnailSizeBytes,
    int ThumbnailFrameCount,
    double ThumbnailCameraVerticalAngle,
    int ThumbnailWidth,
    int ThumbnailHeight,
    bool GenerateThumbnailOnUpload,
    int CleanRecycledFilesAfterDays
) : ICommand<UpdateSettingsResponse>;

public record UpdateSettingsResponse(
    long MaxFileSizeBytes,
    long MaxThumbnailSizeBytes,
    int ThumbnailFrameCount,
    double ThumbnailCameraVerticalAngle,
    int ThumbnailWidth,
    int ThumbnailHeight,
    bool GenerateThumbnailOnUpload,
    int CleanRecycledFilesAfterDays,
    DateTime UpdatedAt
);
