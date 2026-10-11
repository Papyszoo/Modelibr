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

    /// <summary>
    /// Days a recycled item is kept before the purge job deletes it permanently.
    /// <c>0</c> means never. Absent means never: the value is only written when the
    /// user chooses one, so an upgrade can never start deleting data on its own.
    /// </summary>
    public const string CleanRecycledFilesAfterDays = "CleanRecycledFilesAfterDays";

    /// <summary>
    /// Whether a backup is taken before pending database migrations are applied.
    /// Absent means on. The <c>MODELIBR_SKIP_PREMIGRATION_BACKUP</c> env var, when
    /// explicitly set, overrides this (Docker deployments).
    /// </summary>
    public const string PreMigrationBackupEnabled = "PreMigrationBackupEnabled";

    /// <summary>
    /// How many <c>pre-migration-*</c> snapshots to keep. Absent means the default
    /// (3). The <c>MODELIBR_PREMIGRATION_BACKUP_RETENTION</c> env var, when explicitly
    /// set, overrides this (Docker deployments).
    /// </summary>
    public const string PreMigrationBackupRetention = "PreMigrationBackupRetention";

    /// <summary>
    /// Whether an upload of a model file whose hash already has a ready thumbnail
    /// reuses that thumbnail instead of rendering a new one. Absent falls back to
    /// the <c>SKIP_DUPLICATE_THUMBNAILS</c> env var, then off.
    /// </summary>
    public const string SkipDuplicateThumbnails = "SkipDuplicateThumbnails";

    /// <summary>
    /// Whether the local MCP server is served. Absent means on. An explicitly set
    /// <c>MCP_ENABLED</c> env var overrides this (Docker deployments); the change
    /// applies on restart.
    /// </summary>
    public const string McpEnabled = "McpEnabled";

    /// <summary>
    /// Whether MCP write tools are registered. Absent means off. An explicitly set
    /// <c>MCP_WRITE_ENABLED</c> env var overrides this (Docker deployments); the
    /// change applies on restart.
    /// </summary>
    public const string McpWriteEnabled = "McpWriteEnabled";

    /// <summary>
    /// Whether MCP tools that destroy work are allowed to apply. Absent means off.
    /// An explicitly set <c>MCP_DESTRUCTIVE_ENABLED</c> env var overrides this
    /// (Docker deployments); the change applies on restart.
    /// </summary>
    public const string McpDestructiveEnabled = "McpDestructiveEnabled";

    /// <summary>
    /// Background behind rendered thumbnails: <c>transparent</c> or a
    /// <c>#RRGGBB</c> colour. Absent means transparent. Changing it takes effect
    /// for newly rendered thumbnails (use Regenerate All for existing ones).
    /// </summary>
    public const string ThumbnailBackground = "ThumbnailBackground";

    /// <summary>
    /// How long one Blender run may take, in minutes. Absent means the worker's
    /// env-derived default (<c>BLENDER_OPERATION_TIMEOUT_MS</c>, 15 minutes).
    /// </summary>
    public const string BlenderOperationTimeoutMinutes = "BlenderOperationTimeoutMinutes";
}
