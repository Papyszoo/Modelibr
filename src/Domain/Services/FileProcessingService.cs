using Domain.ValueObjects;
using SharedKernel;

namespace Domain.Services;

/// <summary>
/// Domain service for file processing operations.
/// 
/// This service now directly uses the FileType Value Object, eliminating the need
/// for legacy enum conversion. The service provides convenience methods for file
/// processing while delegating core validation logic to the FileType Value Object.
/// </summary>
public class FileProcessingService : IFileProcessingService
{
    public Result<FileType> ValidateFileForModelUpload(string fileName)
    {
        return FileType.ValidateForModelUpload(fileName);
    }

    public Result<FileType> ValidateFileForUpload(string fileName)
    {
        return FileType.ValidateForUpload(fileName);
    }

    public string ExtractFileExtension(string fileName)
    {
        return Path.GetExtension(fileName) ?? string.Empty;
    }

    public string ExtractFileNameWithoutExtension(string fileName)
    {
        return Path.GetFileNameWithoutExtension(fileName) ?? string.Empty;
    }
}