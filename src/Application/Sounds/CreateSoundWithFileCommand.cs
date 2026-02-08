using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Files;
using Application.Abstractions.Services;
using Application.Services;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;
using Microsoft.Extensions.Logging;

namespace Application.Sounds;

internal class CreateSoundWithFileCommandHandler : ICommandHandler<CreateSoundWithFileCommand, CreateSoundWithFileResponse>
{
    private readonly ISoundRepository _soundRepository;
    private readonly IBatchUploadRepository _batchUploadRepository;
    private readonly IFileCreationService _fileCreationService;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IThumbnailQueue _thumbnailQueue;
    private readonly ILogger<CreateSoundWithFileCommandHandler> _logger;

    public CreateSoundWithFileCommandHandler(
        ISoundRepository soundRepository,
        IBatchUploadRepository batchUploadRepository,
        IFileCreationService fileCreationService,
        IDateTimeProvider dateTimeProvider,
        IThumbnailQueue thumbnailQueue,
        ILogger<CreateSoundWithFileCommandHandler> logger)
    {
        _soundRepository = soundRepository;
        _batchUploadRepository = batchUploadRepository;
        _fileCreationService = fileCreationService;
        _dateTimeProvider = dateTimeProvider;
        _thumbnailQueue = thumbnailQueue;
        _logger = logger;
    }

    public async Task<Result<CreateSoundWithFileResponse>> Handle(CreateSoundWithFileCommand command, CancellationToken cancellationToken)
    {
        try
        {
            // 1. Validate and get file type for sound
            var fileTypeResult = FileType.ValidateForSoundUpload(command.FileUpload.FileName);
            if (fileTypeResult.IsFailure)
            {
                return Result.Failure<CreateSoundWithFileResponse>(fileTypeResult.Error);
            }

            // 2. Upload the file (or get existing if duplicate)
            var fileResult = await _fileCreationService.CreateOrGetExistingFileAsync(
                command.FileUpload,
                fileTypeResult.Value,
                cancellationToken);

            if (fileResult.IsFailure)
            {
                return Result.Failure<CreateSoundWithFileResponse>(fileResult.Error);
            }

            var file = fileResult.Value;

            // 3. Check if a sound already exists with this file hash
            var existingSound = await _soundRepository.GetByFileHashAsync(file.Sha256Hash, cancellationToken);
            if (existingSound != null)
            {
                // Track batch upload if batchId provided
                if (!string.IsNullOrWhiteSpace(command.BatchId))
                {
                    var batchUpload = BatchUpload.Create(
                        command.BatchId,
                        "sound",
                        file.Id,
                        _dateTimeProvider.UtcNow,
                        packId: command.PackId,
                        projectId: command.ProjectId,
                        modelId: null,
                        textureSetId: null,
                        spriteId: null,
                        soundId: existingSound.Id);

                    await _batchUploadRepository.AddAsync(batchUpload, cancellationToken);
                }

                return Result.Success(new CreateSoundWithFileResponse(
                    existingSound.Id,
                    existingSound.Name,
                    file.Id,
                    existingSound.Duration,
                    file.SizeBytes));
            }

            // 4. Create new sound
            var sound = Sound.Create(
                command.Name,
                file,
                command.Duration,
                command.Peaks,
                _dateTimeProvider.UtcNow,
                command.CategoryId);

            var createdSound = await _soundRepository.AddAsync(sound, cancellationToken);

            // 5. Enqueue waveform thumbnail generation job
            try
            {
                _logger.LogInformation("Enqueueing waveform thumbnail job for sound {SoundId} with hash {SoundHash}",
                    createdSound.Id, file.Sha256Hash);

                var job = await _thumbnailQueue.EnqueueSoundWaveformAsync(
                    createdSound.Id,
                    file.Sha256Hash,
                    maxAttempts: 3,
                    lockTimeoutMinutes: 10,
                    cancellationToken: cancellationToken);

                _logger.LogInformation("Successfully enqueued waveform thumbnail job {JobId} for sound {SoundId} with status {Status}",
                    job.Id, createdSound.Id, job.Status);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to enqueue waveform thumbnail job for sound {SoundId} with hash {SoundHash}",
                    createdSound.Id, file.Sha256Hash);
                // Don't fail the sound creation if thumbnail job fails to enqueue
            }

            // 6. Track batch upload if batchId provided
            if (!string.IsNullOrWhiteSpace(command.BatchId))
            {
                var batchUpload = BatchUpload.Create(
                    command.BatchId,
                    "sound",
                    file.Id,
                    _dateTimeProvider.UtcNow,
                    packId: command.PackId,
                    projectId: command.ProjectId,
                    modelId: null,
                    textureSetId: null,
                    spriteId: null,
                    soundId: createdSound.Id);

                await _batchUploadRepository.AddAsync(batchUpload, cancellationToken);
            }

            return Result.Success(new CreateSoundWithFileResponse(
                createdSound.Id,
                createdSound.Name,
                file.Id,
                createdSound.Duration,
                file.SizeBytes));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<CreateSoundWithFileResponse>(
                new Error("CreateSoundWithFileFailed", ex.Message));
        }
        catch (InvalidOperationException ex)
        {
            return Result.Failure<CreateSoundWithFileResponse>(
                new Error("BusinessRuleViolation", ex.Message));
        }
    }
}

public record CreateSoundWithFileCommand(
    IFileUpload FileUpload,
    string Name,
    double Duration,
    string? Peaks,
    int? CategoryId,
    string? BatchId,
    int? PackId,
    int? ProjectId) : ICommand<CreateSoundWithFileResponse>;

public record CreateSoundWithFileResponse(
    int SoundId,
    string Name,
    int FileId,
    double Duration,
    long FileSizeBytes);
