namespace Infrastructure.WebDav;

/// <summary>
/// Utility methods shared across WebDAV components.
/// </summary>
internal static class WebDavUtilities
{
    /// <summary>
    /// Extracts the file extension from a filename.
    /// </summary>
    /// <param name="fileName">The filename to extract the extension from</param>
    /// <returns>The extension without the leading dot, or empty string if no extension</returns>
    public static string GetExtension(string fileName)
    {
        var dotIndex = fileName.LastIndexOf('.');
        return dotIndex >= 0 ? fileName[(dotIndex + 1)..] : "";
    }
}
