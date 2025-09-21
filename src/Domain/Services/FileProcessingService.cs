using Domain.Models;
using Domain.ValueObjects;
using SharedKernel;

namespace Domain.Services;

/// <summary>
/// Domain service for file processing operations.
/// 
/// This service has been refactored to follow Domain-Driven Design principles.
/// The core file type validation logic is now encapsulated within the FileType Value Object,
/// following the suggestion to move validation logic into the domain model itself.
/// 
/// This service now acts as an adapter/facade that:
/// 1. Delegates validation logic to the FileType Value Object
/// 2. Maintains backward compatibility with existing code
/// 3. Converts between the new Value Object and legacy enum types
/// 
/// Future refactoring could eliminate this service entirely by updating all
/// consumers to use the FileType Value Object directly.
/// </summary>
public class FileProcessingService : IFileProcessingService
{
    public Result<Models.FileType> ValidateFileForModelUpload(string fileName)
    {
        var fileTypeResult = ValueObjects.FileType.ValidateForModelUpload(fileName);
        if (!fileTypeResult.IsSuccess)
            return Result.Failure<Models.FileType>(fileTypeResult.Error);

        // Convert to legacy enum for backward compatibility
        var legacyFileType = ConvertToLegacyEnum(fileTypeResult.Value);
        return Result.Success(legacyFileType);
    }

    public Result<Models.FileType> ValidateFileForUpload(string fileName)
    {
        var fileTypeResult = ValueObjects.FileType.ValidateForUpload(fileName);
        if (!fileTypeResult.IsSuccess)
            return Result.Failure<Models.FileType>(fileTypeResult.Error);

        // Convert to legacy enum for backward compatibility
        var legacyFileType = ConvertToLegacyEnum(fileTypeResult.Value);
        return Result.Success(legacyFileType);
    }

    public string ExtractFileExtension(string fileName)
    {
        return Path.GetExtension(fileName) ?? string.Empty;
    }

    public string ExtractFileNameWithoutExtension(string fileName)
    {
        return Path.GetFileNameWithoutExtension(fileName) ?? string.Empty;
    }

    private static Models.FileType ConvertToLegacyEnum(ValueObjects.FileType fileType)
    {
        if (fileType == ValueObjects.FileType.Obj) return Models.FileType.Obj;
        if (fileType == ValueObjects.FileType.Fbx) return Models.FileType.Fbx;
        if (fileType == ValueObjects.FileType.Gltf) return Models.FileType.Gltf;
        if (fileType == ValueObjects.FileType.Glb) return Models.FileType.Glb;
        if (fileType == ValueObjects.FileType.Blend) return Models.FileType.Blend;
        if (fileType == ValueObjects.FileType.Max) return Models.FileType.Max;
        if (fileType == ValueObjects.FileType.Maya) return Models.FileType.Maya;
        if (fileType == ValueObjects.FileType.Texture) return Models.FileType.Texture;
        if (fileType == ValueObjects.FileType.Material) return Models.FileType.Material;
        if (fileType == ValueObjects.FileType.Other) return Models.FileType.Other;
        
        return Models.FileType.Unknown;
    }
}