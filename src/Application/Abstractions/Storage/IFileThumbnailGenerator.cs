namespace Application.Abstractions.Storage;

/// <summary>
/// Generates thumbnail previews for uploaded files.
/// For texture files (png, jpg, exr, tga, bmp): generates 4 thumbnails (RGB, R, G, B).
/// For sprite/image files (gif, webp, svg, apng): generates 1 RGB thumbnail.
/// </summary>
public interface IFileThumbnailGenerator
{
    /// <summary>
    /// Generate preview thumbnails for the given file.
    /// Thumbnails are saved via IFilePreviewService.
    /// </summary>
    /// <param name="sha256Hash">Content hash of the file</param>
    /// <param name="fullPath">Absolute path to the file on disk</param>
    /// <param name="mimeType">MIME type of the file</param>
    /// <param name="ct">Cancellation token</param>
    Task GeneratePreviewsAsync(string sha256Hash, string fullPath, string mimeType, CancellationToken ct);
}
