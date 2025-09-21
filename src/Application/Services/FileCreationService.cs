using Application.Abstractions.Files;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Abstractions.Storage;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Services;

public interface IFileCreationService
{
    Task<Result<Domain.Models.File>> CreateOrGetExistingFileAsync(
        IFileUpload fileUpload,
        FileType fileType,
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
        FileType fileType,
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
        var stored = await _storage.SaveAsync(fileUpload, Domain.Files.FileType.Model3D, cancellationToken);

        var originalFileName = Path.GetFileName(fileUpload.FileName);
        var extension = Path.GetExtension(originalFileName) ?? string.Empty;

        try
        {
            var fileEntity = Domain.Models.File.Create(
                originalFileName,
                stored.StoredName,
                stored.RelativePath,
                _fileUtilityService.GetMimeType(extension),
                fileType,
                0, // We'll set this properly later
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
}