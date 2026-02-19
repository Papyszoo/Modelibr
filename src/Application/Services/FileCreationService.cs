using Application.Abstractions.Files;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Abstractions.Storage;
using Domain.Models;
using Domain.Services;
using Microsoft.Extensions.Logging;
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
    private readonly IFileThumbnailGenerator _thumbnailGenerator;
    private readonly IUploadPathProvider _pathProvider;
    private readonly ILogger<FileCreationService> _logger;

    public FileCreationService(
        IFileStorage storage,
        IFileRepository fileRepository,
        IFileUtilityService fileUtilityService,
        IDateTimeProvider dateTimeProvider,
        IFileThumbnailGenerator thumbnailGenerator,
        IUploadPathProvider pathProvider,
        ILogger<FileCreationService> logger)
    {
        _storage = storage;
        _fileRepository = fileRepository;
        _fileUtilityService = fileUtilityService;
        _dateTimeProvider = dateTimeProvider;
        _thumbnailGenerator = thumbnailGenerator;
        _pathProvider = pathProvider;
        _logger = logger;
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
            // Verify the physical file still exists on disk — it may have been
            // permanently deleted while the DB record remained orphaned.
            if (_storage.FileExists(existingFile.FilePath))
            {
                // Generate thumbnails if they don't already exist (migration case)
                await GenerateThumbnailsSafe(existingFile.Sha256Hash, existingFile.FilePath, existingFile.MimeType, cancellationToken);
                return Result.Success(existingFile);
            }

            // Physical file is missing — clean up orphaned DB record so we can re-save
            _logger.LogWarning(
                "Orphaned file record {FileId} detected (hash {Hash}): physical file missing at {Path}. Cleaning up.",
                existingFile.Id, hash, existingFile.FilePath);
            await _fileRepository.HardDeleteAsync(existingFile.Id, cancellationToken);
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
                stored.SizeBytes,
                stored.Sha256,
                _dateTimeProvider.UtcNow
            );

            // Generate thumbnails for the newly created file
            await GenerateThumbnailsSafe(stored.Sha256, stored.RelativePath, fileType.GetMimeType(), cancellationToken);

            return Result.Success(fileEntity);
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<Domain.Models.File>(new Error("FileCreationFailed", ex.Message));
        }
    }

    private async Task GenerateThumbnailsSafe(string sha256Hash, string relativePath, string mimeType, CancellationToken ct)
    {
        try
        {
            var fullPath = Path.Combine(_pathProvider.UploadRootPath, relativePath);
            await _thumbnailGenerator.GeneratePreviewsAsync(sha256Hash, fullPath, mimeType, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to generate thumbnails for file {Hash}", sha256Hash);
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