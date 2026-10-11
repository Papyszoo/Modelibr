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
    bool AutoAssignOnImport,
    int CleanRecycledFilesAfterDays,
    bool PreMigrationBackupEnabled,
    int PreMigrationBackupRetention,
    bool SkipDuplicateThumbnails,
    bool McpEnabled,
    bool McpWriteEnabled,
    bool McpDestructiveEnabled,
    string ThumbnailBackground,
    int BlenderOperationTimeoutMinutes,
    DateTime CreatedAt,
    DateTime UpdatedAt
);
