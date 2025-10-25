using Application.Abstractions.Messaging;

namespace Application.Settings;

public record GetSettingsQuery : IQuery<GetSettingsQueryResponse>;

public record GetSettingsQueryResponse(
    long MaxFileSizeBytes,
    long MaxThumbnailSizeBytes,
    int ThumbnailFrameCount,
    double ThumbnailCameraVerticalAngle,
    int ThumbnailWidth,
    int ThumbnailHeight,
    bool GenerateThumbnailOnUpload,
    int CleanRecycledFilesAfterDays,
    DateTime CreatedAt,
    DateTime UpdatedAt
);
