using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.EnvironmentMaps;

internal sealed class CreateEnvironmentMapCommandHandler : ICommandHandler<CreateEnvironmentMapCommand, CreateEnvironmentMapResponse>
{
    private readonly IEnvironmentMapRepository _environmentMapRepository;
    private readonly IFileRepository _fileRepository;
    private readonly IEnvironmentMapSizeLabelService _sizeLabelService;
    private readonly IThumbnailQueue _thumbnailQueue;
    private readonly IDateTimeProvider _dateTimeProvider;

    public CreateEnvironmentMapCommandHandler(
        IEnvironmentMapRepository environmentMapRepository,
        IFileRepository fileRepository,
        IEnvironmentMapSizeLabelService sizeLabelService,
        IThumbnailQueue thumbnailQueue,
        IDateTimeProvider dateTimeProvider)
    {
        _environmentMapRepository = environmentMapRepository;
        _fileRepository = fileRepository;
        _sizeLabelService = sizeLabelService;
        _thumbnailQueue = thumbnailQueue;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<CreateEnvironmentMapResponse>> Handle(CreateEnvironmentMapCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var existingByName = await _environmentMapRepository.GetByNameAsync(command.Name, cancellationToken);
            if (existingByName != null)
            {
                return Result.Failure<CreateEnvironmentMapResponse>(
                    new Error("EnvironmentMapAlreadyExists", $"An environment map with the name '{command.Name}' already exists."));
            }

            var resolvedFilesResult = await EnvironmentMapVariantSupport.ResolveFromExistingFilesAsync(
                new EnvironmentMapVariantReferenceInput(command.FileId, command.CubeFaces),
                _fileRepository,
                cancellationToken);
            if (resolvedFilesResult.IsFailure)
                return Result.Failure<CreateEnvironmentMapResponse>(resolvedFilesResult.Error);

            var now = _dateTimeProvider.UtcNow;
            var sizeLabelResult = await EnvironmentMapVariantSupport.ResolveSizeLabelAsync(
                command.SizeLabel,
                resolvedFilesResult.Value,
                _sizeLabelService,
                cancellationToken);
            if (sizeLabelResult.IsFailure)
                return Result.Failure<CreateEnvironmentMapResponse>(sizeLabelResult.Error);

            var environmentMap = EnvironmentMap.Create(command.Name, now);
            var variant = resolvedFilesResult.Value.CreateVariant(sizeLabelResult.Value, now);
            environmentMap.AddVariant(variant, now);

            var created = await _environmentMapRepository.AddAsync(environmentMap, cancellationToken);

            created.SetPreviewVariant(variant.Id, now);
            await _environmentMapRepository.UpdateAsync(created, cancellationToken);

            await _thumbnailQueue.EnqueueEnvironmentMapThumbnailAsync(created.Id, variant.Id, cancellationToken: cancellationToken);

            return Result.Success(new CreateEnvironmentMapResponse(
                created.Id,
                created.Name,
                variant.Id,
                resolvedFilesResult.Value.PreviewFile?.Id ?? 0,
                created.PreviewVariantId,
                variant.ProjectionType.ToString().ToLowerInvariant()));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<CreateEnvironmentMapResponse>(new Error("EnvironmentMapCreationFailed", ex.Message));
        }
        catch (InvalidOperationException ex)
        {
            return Result.Failure<CreateEnvironmentMapResponse>(new Error("BusinessRuleViolation", ex.Message));
        }
    }
}

public record CreateEnvironmentMapCommand(
    string Name,
    int? FileId,
    string? SizeLabel,
    EnvironmentMapCubeFaceFileIds? CubeFaces) : ICommand<CreateEnvironmentMapResponse>;

public record CreateEnvironmentMapResponse(
    int Id,
    string Name,
    int VariantId,
    int FileId,
    int? PreviewVariantId,
    string ProjectionType);
