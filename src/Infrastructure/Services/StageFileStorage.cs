using Application.Abstractions.Services;
using Application.Abstractions.Storage;

namespace Infrastructure.Services;

public sealed class StageFileStorage : IStageFileStorage
{
    private readonly IUploadPathProvider _pathProvider;
    private const string StagesDirectory = "stages";

    public StageFileStorage(IUploadPathProvider pathProvider)
    {
        _pathProvider = pathProvider;
    }

    public async Task<string> SaveTsxFileAsync(string stageName, string tsxContent, CancellationToken cancellationToken = default)
    {
        var stagesDir = GetStagesDirectory();
        Directory.CreateDirectory(stagesDir);

        var fileName = SanitizeFileName(stageName) + ".tsx";
        var filePath = Path.Combine(stagesDir, fileName);

        await File.WriteAllTextAsync(filePath, tsxContent, cancellationToken);

        // Return relative path from upload root
        var relativePath = Path.Combine(StagesDirectory, fileName).Replace('\\', '/');
        return relativePath;
    }

    public async Task<string> GetTsxFileAsync(string filePath, CancellationToken cancellationToken = default)
    {
        ValidateFilePath(filePath);
        
        var fullPath = Path.Combine(_pathProvider.UploadRootPath, filePath);
        
        if (!File.Exists(fullPath))
        {
            throw new FileNotFoundException($"TSX file not found: {filePath}");
        }

        return await File.ReadAllTextAsync(fullPath, cancellationToken);
    }

    public bool TsxFileExists(string filePath)
    {
        try
        {
            ValidateFilePath(filePath);
            var fullPath = Path.Combine(_pathProvider.UploadRootPath, filePath);
            return File.Exists(fullPath);
        }
        catch
        {
            return false;
        }
    }

    public Task DeleteTsxFileAsync(string filePath, CancellationToken cancellationToken = default)
    {
        ValidateFilePath(filePath);
        
        var fullPath = Path.Combine(_pathProvider.UploadRootPath, filePath);
        
        if (File.Exists(fullPath))
        {
            File.Delete(fullPath);
        }

        return Task.CompletedTask;
    }

    private string GetStagesDirectory()
    {
        return Path.Combine(_pathProvider.UploadRootPath, StagesDirectory);
    }

    private string SanitizeFileName(string fileName)
    {
        // Remove invalid file name characters
        var invalid = Path.GetInvalidFileNameChars();
        var sanitized = new string(fileName.Select(c => invalid.Contains(c) ? '_' : c).ToArray());
        
        // Limit length
        if (sanitized.Length > 100)
        {
            sanitized = sanitized.Substring(0, 100);
        }

        return sanitized;
    }

    private void ValidateFilePath(string filePath)
    {
        // Security check: ensure the path is within the stages directory
        var normalizedPath = Path.GetFullPath(Path.Combine(_pathProvider.UploadRootPath, filePath));
        var stagesDir = Path.GetFullPath(GetStagesDirectory());

        if (!normalizedPath.StartsWith(stagesDir, StringComparison.OrdinalIgnoreCase))
        {
            throw new UnauthorizedAccessException("Access to file outside stages directory is not allowed");
        }
    }
}
