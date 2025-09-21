using Domain.Models;
using SharedKernel;

namespace Domain.Services;

/// <summary>
/// Domain service for file processing operations.
/// Note: Core file type validation logic has been moved to the FileType Value Object.
/// This service maintains backward compatibility while delegating to the Value Object.
/// </summary>
public interface IFileProcessingService
{
    /// <summary>
    /// Validates a file for model upload. Only renderable file types are allowed.
    /// </summary>
    Result<FileType> ValidateFileForModelUpload(string fileName);
    
    /// <summary>
    /// Validates a file for general upload. All supported file types are allowed.
    /// </summary>
    Result<FileType> ValidateFileForUpload(string fileName);
    
    /// <summary>
    /// Extracts the file extension from a filename.
    /// </summary>
    string ExtractFileExtension(string fileName);
    
    /// <summary>
    /// Extracts the filename without extension.
    /// </summary>
    string ExtractFileNameWithoutExtension(string fileName);
}