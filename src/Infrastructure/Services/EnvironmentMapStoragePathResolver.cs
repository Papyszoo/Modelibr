namespace Infrastructure.Services;

public static class EnvironmentMapStoragePathResolver
{
    public static string ResolveFullPath(string uploadRootPath, string storedPath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(uploadRootPath);
        ArgumentException.ThrowIfNullOrWhiteSpace(storedPath);

        var fullUploadRootPath = Path.GetFullPath(uploadRootPath);

        if (Path.IsPathRooted(storedPath))
        {
            var fullStoredPath = Path.GetFullPath(storedPath);
            if (fullStoredPath.Equals(fullUploadRootPath, StringComparison.OrdinalIgnoreCase) ||
                fullStoredPath.StartsWith(fullUploadRootPath + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            {
                return fullStoredPath;
            }
        }

        var normalizedRelativePath = storedPath
            .Replace(Path.AltDirectorySeparatorChar, Path.DirectorySeparatorChar)
            .TrimStart(Path.DirectorySeparatorChar);

        var uploadsPrefix = $"uploads{Path.DirectorySeparatorChar}";
        if (normalizedRelativePath.StartsWith(uploadsPrefix, StringComparison.OrdinalIgnoreCase))
            normalizedRelativePath = normalizedRelativePath[uploadsPrefix.Length..];

        return Path.Combine(fullUploadRootPath, normalizedRelativePath);
    }
}
