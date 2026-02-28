namespace Application.Abstractions.Storage;

/// <summary>
/// Convention-based file preview storage.
/// Previews are stored at {uploadRoot}/previews/{sha256Hash}.png
/// Channel-specific previews: {uploadRoot}/previews/{sha256Hash}_{channel}.png
/// </summary>
public interface IFilePreviewService
{
    /// <summary>
    /// Returns the absolute path to the RGB preview file if it exists, or null.
    /// </summary>
    string? GetPreviewPath(string sha256Hash);

    /// <summary>
    /// Returns the absolute path to a channel-specific preview file if it exists, or null.
    /// </summary>
    /// <param name="sha256Hash">File content hash</param>
    /// <param name="channel">Channel name: "rgb", "r", "g", "b"</param>
    string? GetPreviewPath(string sha256Hash, string channel);

    /// <summary>
    /// Saves a preview image for the given file hash (RGB by default).
    /// </summary>
    Task SavePreviewAsync(string sha256Hash, Stream content, CancellationToken ct);

    /// <summary>
    /// Saves a channel-specific preview image for the given file hash.
    /// </summary>
    Task SavePreviewAsync(string sha256Hash, string channel, Stream content, CancellationToken ct);
}
