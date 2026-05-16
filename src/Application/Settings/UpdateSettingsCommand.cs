using Application.Abstractions.Messaging;

namespace Application.Settings;

public record UpdateSettingsCommand(
    long MaxFileSizeBytes,
    long MaxThumbnailSizeBytes,
    int ThumbnailFrameCount,
    int ThumbnailSize,
    bool GenerateThumbnailOnUpload,
    bool GenerateAnimatedThumbnail,
    int TextureProxySize
) : ICommand<UpdateSettingsResponse>;

public record UpdateSettingsResponse(
    long MaxFileSizeBytes,
    long MaxThumbnailSizeBytes,
    int ThumbnailFrameCount,
    int ThumbnailSize,
    bool GenerateThumbnailOnUpload,
    bool GenerateAnimatedThumbnail,
    int TextureProxySize,
    DateTime UpdatedAt
);
