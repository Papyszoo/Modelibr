using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Services;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.EnvironmentMaps;

internal sealed class CreateEnvironmentMapWithFileCommandHandler : ICommandHandler<CreateEnvironmentMapWithFileCommand, CreateEnvironmentMapWithFileResponse>
{
    private readonly IEnvironmentMapRepository _environmentMapRepository;
    private readonly IBatchUploadRepository _batchUploadRepository;
    private readonly IFileCreationService _fileCreationService;
    private readonly IEnvironmentMapSizeLabelService _sizeLabelService;
    private readonly IThumbnailQueue _thumbnailQueue;
    private readonly IDateTimeProvider _dateTimeProvider;

    public CreateEnvironmentMapWithFileCommandHandler(
        IEnvironmentMapRepository environmentMapRepository,
        IBatchUploadRepository batchUploadRepository,
        IFileCreationService fileCreationService,
        IEnvironmentMapSizeLabelService sizeLabelService,
        IThumbnailQueue thumbnailQueue,
        IDateTimeProvider dateTimeProvider)
    {
        _environmentMapRepository = environmentMapRepository;
        _batchUploadRepository = batchUploadRepository;
        _fileCreationService = fileCreationService;
        _sizeLabelService = sizeLabelService;
        _thumbnailQueue = thumbnailQueue;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<CreateEnvironmentMapWithFileResponse>> Handle(CreateEnvironmentMapWithFileCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var resolvedFilesResult = await EnvironmentMapVariantSupport.ResolveFromUploadsAsync(
                new EnvironmentMapVariantUploadInput(command.FileUpload, command.CubeFaces),
                _fileCreationService,
                cancellationToken);
            if (resolvedFilesResult.IsFailure)
                return Result.Failure<CreateEnvironmentMapWithFileResponse>(resolvedFilesResult.Error);

            var resolvedFiles = resolvedFilesResult.Value;
            var existing = resolvedFiles.ProjectionType == EnvironmentMapProjectionType.Panoramic
                ? await _environmentMapRepository.GetByFileHashAsync(resolvedFiles.PanoramicFile!.Sha256Hash, cancellationToken)
                : await _environmentMapRepository.GetByFileHashesAsync(
                    EnvironmentMapVariantSupport.GetHashes(resolvedFiles),
                    EnvironmentMapProjectionType.Cube,
                    cancellationToken);
            if (existing != null)
            {
                if (!string.IsNullOrWhiteSpace(command.BatchId))
                {
                    await _batchUploadRepository.AddRangeAsync(
                        EnvironmentMapVariantSupport.CreateBatchUploads(
                            command.BatchId,
                            _dateTimeProvider.UtcNow,
                            resolvedFiles,
                            command.PackId,
                            command.ProjectId,
                            existing.Id),
                        cancellationToken);
                }

                var existingVariant = existing.Variants.First(v =>
                    !v.IsDeleted &&
                    v.ProjectionType == resolvedFiles.ProjectionType &&
                    EnvironmentMapVariantSupport.GetHashes(resolvedFiles)
                        .OrderBy(hash => hash)
                        .SequenceEqual(
                            GetVariantHashes(v).OrderBy(hash => hash),
                            StringComparer.OrdinalIgnoreCase));

                return Result.Success(new CreateEnvironmentMapWithFileResponse(
                    existing.Id,
                    existing.Name,
                    existingVariant.Id,
                    existingVariant.GetPreviewFile()?.Id ?? 0,
                    existing.PreviewVariantId,
                    existingVariant.ProjectionType.ToString().ToLowerInvariant()));
            }

            var now = _dateTimeProvider.UtcNow;
            var sizeLabelResult = await EnvironmentMapVariantSupport.ResolveSizeLabelAsync(
                command.SizeLabel,
                resolvedFiles,
                _sizeLabelService,
                cancellationToken);
            if (sizeLabelResult.IsFailure)
                return Result.Failure<CreateEnvironmentMapWithFileResponse>(sizeLabelResult.Error);

            var environmentMap = EnvironmentMap.Create(command.Name, now);
            var created = await _environmentMapRepository.AddAsync(environmentMap, cancellationToken);

            var variant = resolvedFiles.CreateVariant(sizeLabelResult.Value, now);
            created.AddVariant(variant, now);
            await _environmentMapRepository.UpdateAsync(created, cancellationToken);

            created.SetPreviewVariant(variant.Id, now);
            await _environmentMapRepository.UpdateAsync(created, cancellationToken);

            await _thumbnailQueue.EnqueueEnvironmentMapThumbnailAsync(created.Id, variant.Id, cancellationToken: cancellationToken);

            if (!string.IsNullOrWhiteSpace(command.BatchId))
            {
                await _batchUploadRepository.AddRangeAsync(
                    EnvironmentMapVariantSupport.CreateBatchUploads(
                        command.BatchId,
                        now,
                        resolvedFiles,
                        command.PackId,
                        command.ProjectId,
                        created.Id),
                    cancellationToken);
            }

            return Result.Success(new CreateEnvironmentMapWithFileResponse(
                created.Id,
                created.Name,
                variant.Id,
                resolvedFiles.PreviewFile?.Id ?? 0,
                created.PreviewVariantId,
                variant.ProjectionType.ToString().ToLowerInvariant()));
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

    private static IEnumerable<string> GetVariantHashes(EnvironmentMapVariant variant)
    {
        if (variant.IsPanoramic)
            return variant.File == null ? [] : [variant.File.Sha256Hash];

        return variant.FaceFiles.Select(faceFile => faceFile.File.Sha256Hash);
    }
}

public record CreateEnvironmentMapWithFileCommand(
    IFileUpload? FileUpload,
    EnvironmentMapCubeFaceUploads? CubeFaces,
    string Name,
    string? SizeLabel,
    string? BatchId,
    int? PackId,
    int? ProjectId) : ICommand<CreateEnvironmentMapWithFileResponse>;

public record CreateEnvironmentMapWithFileResponse(
    int EnvironmentMapId,
    string Name,
    int VariantId,
    int FileId,
    int? PreviewVariantId,
    string ProjectionType);
