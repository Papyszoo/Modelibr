using Application.Abstractions.Files;
using Domain.Files;

namespace Application.Abstractions.Storage;

public record StoredFileResult(
    string RelativePath,
    string StoredName,
    string Sha256,
    long SizeBytes);

public interface IFileStorage
{
    Task<StoredFileResult> SaveAsync(
        IFileUpload upload,
        FileType fileType,
        CancellationToken ct);
    
    Task DeleteFileAsync(string filePath, CancellationToken ct);
    
    /// <summary>
    /// Checks if a physical file exists on disk.
    /// </summary>
    bool FileExists(string filePath);
}