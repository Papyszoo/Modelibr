using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Services;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.EnvironmentMaps;

internal sealed class CreateEnvironmentMapWithFileCommandHandler : ICommandHandler<CreateEnvironmentMapWithFileCommand, CreateEnvironmentMapWithFileResponse>
{
    private readonly IEnvironmentMapRepository _environmentMapRepository;
    private readonly IBatchUploadRepository _batchUploadRepository;
    private readonly IFileCreationService _fileCreationService;
    private readonly IDateTimeProvider _dateTimeProvider;

    public CreateEnvironmentMapWithFileCommandHandler(
        IEnvironmentMapRepository environmentMapRepository,
        IBatchUploadRepository batchUploadRepository,
        IFileCreationService fileCreationService,
        IDateTimeProvider dateTimeProvider)
    {
        _environmentMapRepository = environmentMapRepository;
        _batchUploadRepository = batchUploadRepository;
        _fileCreationService = fileCreationService;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<CreateEnvironmentMapWithFileResponse>> Handle(CreateEnvironmentMapWithFileCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var fileTypeResult = FileType.ValidateForEnvironmentMapUpload(command.FileUpload.FileName);
            if (fileTypeResult.IsFailure)
                return Result.Failure<CreateEnvironmentMapWithFileResponse>(fileTypeResult.Error);

            var fileResult = await _fileCreationService.CreateOrGetExistingFileAsync(command.FileUpload, fileTypeResult.Value, cancellationToken);
            if (fileResult.IsFailure)
                return Result.Failure<CreateEnvironmentMapWithFileResponse>(fileResult.Error);

            var file = fileResult.Value;
            var existing = await _environmentMapRepository.GetByFileHashAsync(file.Sha256Hash, cancellationToken);
            if (existing != null)
            {
                if (!string.IsNullOrWhiteSpace(command.BatchId))
                {
                    await _batchUploadRepository.AddAsync(
                        BatchUpload.Create(
                            command.BatchId,
                            "environmentmap",
                            file.Id,
                            _dateTimeProvider.UtcNow,
                            packId: command.PackId,
                            projectId: command.ProjectId,
                            environmentMapId: existing.Id),
                        cancellationToken);
                }

                var existingVariant = existing.Variants.First(v => !v.IsDeleted && v.File.Sha256Hash == file.Sha256Hash);
                return Result.Success(new CreateEnvironmentMapWithFileResponse(existing.Id, existing.Name, existingVariant.Id, file.Id, existing.PreviewVariantId));
            }

            var now = _dateTimeProvider.UtcNow;
            var environmentMap = EnvironmentMap.Create(command.Name, now);
            var created = await _environmentMapRepository.AddAsync(environmentMap, cancellationToken);

            var variant = EnvironmentMapVariant.Create(file, command.SizeLabel, now);
            created.AddVariant(variant, now);
            await _environmentMapRepository.UpdateAsync(created, cancellationToken);

            created.SetPreviewVariant(variant.Id, now);
            await _environmentMapRepository.UpdateAsync(created, cancellationToken);

            if (!string.IsNullOrWhiteSpace(command.BatchId))
            {
                await _batchUploadRepository.AddAsync(
                    BatchUpload.Create(
                        command.BatchId,
                        "environmentmap",
                        file.Id,
                        now,
                        packId: command.PackId,
                        projectId: command.ProjectId,
                        environmentMapId: created.Id),
                    cancellationToken);
            }

            return Result.Success(new CreateEnvironmentMapWithFileResponse(created.Id, created.Name, variant.Id, file.Id, created.PreviewVariantId));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<CreateEnvironmentMapWithFileResponse>(new Error("CreateEnvironmentMapWithFileFailed", ex.Message));
        }
        catch (InvalidOperationException ex)
        {
            return Result.Failure<CreateEnvironmentMapWithFileResponse>(new Error("BusinessRuleViolation", ex.Message));
        }
    }
}

public record CreateEnvironmentMapWithFileCommand(
    IFileUpload FileUpload,
    string Name,
    string SizeLabel,
    string? BatchId,
    int? PackId,
    int? ProjectId) : ICommand<CreateEnvironmentMapWithFileResponse>;

public record CreateEnvironmentMapWithFileResponse(
    int EnvironmentMapId,
    string Name,
    int VariantId,
    int FileId,
    int? PreviewVariantId);
