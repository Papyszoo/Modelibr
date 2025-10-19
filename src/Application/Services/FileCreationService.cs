using Application.Abstractions.Files;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Abstractions.Storage;
using Domain.Models;
using Domain.Services;
using SharedKernel;
using FileTypeVO = Domain.ValueObjects.FileType;

namespace Application.Services;

public interface IFileCreationService
{
    Task<Result<Domain.Models.File>> CreateOrGetExistingFileAsync(
        IFileUpload fileUpload,
        FileTypeVO fileType,
        CancellationToken cancellationToken = default);
}

internal sealed class FileCreationService : IFileCreationService
{
    private readonly IFileStorage _storage;
    private readonly IFileRepository _fileRepository;
    private readonly IFileUtilityService _fileUtilityService;
    private readonly IDateTimeProvider _dateTimeProvider;

    public FileCreationService(
        IFileStorage storage,
        IFileRepository fileRepository,
        IFileUtilityService fileUtilityService,
        IDateTimeProvider dateTimeProvider)
    {
        _storage = storage;
        _fileRepository = fileRepository;
        _fileUtilityService = fileUtilityService;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<Domain.Models.File>> CreateOrGetExistingFileAsync(
        IFileUpload fileUpload,
        FileTypeVO fileType,
        CancellationToken cancellationToken = default)
    {
        // Calculate hash first to check for existing files before saving to disk
        var hash = await _fileUtilityService.CalculateFileHashAsync(fileUpload, cancellationToken);

        // Check if file already exists in database by hash
        var existingFile = await _fileRepository.GetBySha256HashAsync(hash, cancellationToken);
        if (existingFile != null)
        {
            return Result.Success(existingFile);
        }

        // File doesn't exist, save to disk and create file entity
        // Map to the appropriate storage file type based on category
        var storageFileType = MapToStorageFileType(fileType);
        var stored = await _storage.SaveAsync(fileUpload, storageFileType, cancellationToken);

        var originalFileName = Path.GetFileName(fileUpload.FileName);

        try
        {
            var fileEntity = Domain.Models.File.Create(
                originalFileName,
                stored.StoredName,
                stored.RelativePath,
                fileType.GetMimeType(),
                fileType,
                fileUpload.Length,
                stored.Sha256,
                _dateTimeProvider.UtcNow
            );

            return Result.Success(fileEntity);
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<Domain.Models.File>(new Error("FileCreationFailed", ex.Message));
        }
    }

    private static Domain.Files.FileType MapToStorageFileType(FileTypeVO fileType)
    {
        return fileType.Category switch
        {
            Domain.ValueObjects.FileTypeCategory.Model3D => Domain.Files.FileType.Model3D,
            Domain.ValueObjects.FileTypeCategory.Texture => Domain.Files.FileType.Texture,
            Domain.ValueObjects.FileTypeCategory.Project => Domain.Files.FileType.Project,
            _ => Domain.Files.FileType.Unknown
        };
    }
}