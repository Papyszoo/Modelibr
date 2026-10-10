namespace Application.Abstractions.Storage;

/// <summary>
/// Resolves a stored file path against the uploads root.
/// </summary>
/// <remarks>
/// Thumbnails, previews and scene renders are persisted relative to the uploads
/// root, exactly like every other stored file, so their absolute location is only
/// known once the current root is applied. A path that is still absolute was
/// written before the relative-path migration; it is accepted only while it still
/// points inside the current uploads root, so it resolves on the machine that
/// wrote it. Anything else - an absolute path outside the root, or a relative one
/// that climbs out with <c>..</c> - is refused rather than opened, so a malformed
/// or hostile stored value (a crafted restore row, say) cannot turn a read site
/// into an arbitrary-file read.
/// </remarks>
public static class UploadPathResolver
{
    public static string Resolve(this IUploadPathProvider provider, string storedPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(storedPath);

        var root = Path.GetFullPath(provider.UploadRootPath);

        var candidate = Path.IsPathRooted(storedPath)
            ? Path.GetFullPath(storedPath)
            : Path.GetFullPath(Path.Combine(root, storedPath));

        if (!IsWithinRoot(root, candidate))
        {
            throw new InvalidOperationException(
                $"Stored path '{storedPath}' resolves outside the uploads root.");
        }

        return candidate;
    }

    /// <summary>
    /// Whether <paramref name="candidate"/> equals or sits under
    /// <paramref name="root"/>, using the platform's path comparison.
    /// </summary>
    internal static bool IsWithinRoot(string root, string candidate)
    {
        var rootFull = Path.GetFullPath(root);
        if (string.Equals(candidate, rootFull, PathComparison))
        {
            return true;
        }

        var rootPrefix = rootFull.EndsWith(Path.DirectorySeparatorChar)
            ? rootFull
            : rootFull + Path.DirectorySeparatorChar;
        return candidate.StartsWith(rootPrefix, PathComparison);
    }

    private static StringComparison PathComparison =>
        OperatingSystem.IsWindows()
            ? StringComparison.OrdinalIgnoreCase
            : StringComparison.Ordinal;
}
