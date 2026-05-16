using Application.Abstractions.Messaging;

namespace Application.Settings;

public record GetSettingsQuery : IQuery<GetSettingsQueryResponse>;

public record GetSettingsQueryResponse(
    long MaxFileSizeBytes,
    long MaxThumbnailSizeBytes,
    int ThumbnailFrameCount,
    int ThumbnailSize,
    bool GenerateThumbnailOnUpload,
    bool GenerateAnimatedThumbnail,
    int TextureProxySize,
    string BlenderPath,
    bool BlenderEnabled,
    string DuplicateNamePolicy,
    DateTime CreatedAt,
    DateTime UpdatedAt
);
