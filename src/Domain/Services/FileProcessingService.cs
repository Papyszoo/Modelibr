using Domain.Models;
using SharedKernel;

namespace Domain.Services;

public class FileProcessingService : IFileProcessingService
{
    public Result<FileType> ValidateFileForModelUpload(string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            return Result.Failure<FileType>(new Error("InvalidFileName", "File name cannot be null or empty."));

        var extension = ExtractFileExtension(fileName);
        var fileType = FileTypeExtensions.GetFileTypeFromExtension(extension);

        if (!fileType.IsRenderable())
        {
            return Result.Failure<FileType>(
                new Error("InvalidFileType", $"File type '{extension}' is not supported for model upload. Only .obj, .fbx, .gltf, and .glb files are allowed."));
        }

        return Result.Success(fileType);
    }

    public Result<FileType> ValidateFileForUpload(string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            return Result.Failure<FileType>(new Error("InvalidFileName", "File name cannot be null or empty."));

        var extension = ExtractFileExtension(fileName);
        var fileType = FileTypeExtensions.GetFileTypeFromExtension(extension);

        if (fileType == FileType.Unknown)
        {
            return Result.Failure<FileType>(
                new Error("UnsupportedFileType", $"File type '{extension}' is not supported."));
        }

        return Result.Success(fileType);
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