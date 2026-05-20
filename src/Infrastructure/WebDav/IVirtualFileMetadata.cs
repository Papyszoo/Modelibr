namespace Infrastructure.WebDav;

/// <summary>
/// Exposes size and MIME metadata for a virtual WebDAV file so a HEAD request can be
/// answered without opening (and thereby generating/processing) the content stream.
///
/// macOS WebDAV clients (webdavfs) issue a HEAD on every file while listing a folder.
/// If that HEAD blocks on on-demand content production — e.g. the Blender CLI render
/// behind <see cref="VirtualGeneratedBlendFile"/>, or the image channel extraction
/// behind <see cref="VirtualExtractedTextureFile"/> — the client times out and drops
/// the file from Finder ("shows up for a second and disappears").
/// </summary>
public interface IVirtualFileMetadata
{
    /// <summary>File size in bytes. May be approximate for files produced on demand.</summary>
    long SizeBytes { get; }

    /// <summary>MIME content type.</summary>
    string MimeType { get; }
}
