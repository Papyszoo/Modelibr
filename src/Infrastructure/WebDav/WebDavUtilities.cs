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

    /// <summary>
    /// Builds a virtual filename from an asset's Name and the extension of its stored file.
    /// Used so that WebDAV listings reflect the unique asset name rather than the original upload filename.
    /// </summary>
    public static string GetVirtualFileName(string assetName, string originalFileName)
    {
        var ext = GetExtension(originalFileName);
        return string.IsNullOrEmpty(ext) ? assetName : $"{assetName}.{ext}";
    }
}
