using Domain.Models;
using SharedKernel;

namespace Domain.Services;

public interface IFileProcessingService
{
    Result<FileType> ValidateFileForModelUpload(string fileName);
    Result<FileType> ValidateFileForUpload(string fileName);
    string ExtractFileExtension(string fileName);
    string ExtractFileNameWithoutExtension(string fileName);
}