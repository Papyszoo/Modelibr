using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.EnvironmentMaps;

internal sealed class AddEnvironmentMapVariantCommandHandler : ICommandHandler<AddEnvironmentMapVariantCommand, AddEnvironmentMapVariantResponse>
{
    private readonly IEnvironmentMapRepository _environmentMapRepository;
    private readonly IFileRepository _fileRepository;
    private readonly IEnvironmentMapSizeLabelService _sizeLabelService;
    private readonly IThumbnailQueue _thumbnailQueue;
    private readonly IDateTimeProvider _dateTimeProvider;

    public AddEnvironmentMapVariantCommandHandler(
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

    public async Task<Result<AddEnvironmentMapVariantResponse>> Handle(AddEnvironmentMapVariantCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var environmentMap = await _environmentMapRepository.GetByIdAsync(command.EnvironmentMapId, cancellationToken);
            if (environmentMap == null)
            {
                return Result.Failure<AddEnvironmentMapVariantResponse>(
                    new Error("EnvironmentMapNotFound", $"Environment map with ID {command.EnvironmentMapId} was not found."));
            }

            var resolvedFilesResult = await EnvironmentMapVariantSupport.ResolveFromExistingFilesAsync(
                new EnvironmentMapVariantReferenceInput(command.FileId, command.CubeFaces),
                _fileRepository,
                cancellationToken);
            if (resolvedFilesResult.IsFailure)
                return Result.Failure<AddEnvironmentMapVariantResponse>(resolvedFilesResult.Error);

            var now = _dateTimeProvider.UtcNow;
            var sizeLabelResult = await EnvironmentMapVariantSupport.ResolveSizeLabelAsync(
                command.SizeLabel,
                resolvedFilesResult.Value,
                _sizeLabelService,
                cancellationToken);
            if (sizeLabelResult.IsFailure)
                return Result.Failure<AddEnvironmentMapVariantResponse>(sizeLabelResult.Error);

            var variant = resolvedFilesResult.Value.CreateVariant(sizeLabelResult.Value, now);
            environmentMap.AddVariant(variant, now);
            await _environmentMapRepository.UpdateAsync(environmentMap, cancellationToken);

            if (!environmentMap.PreviewVariantId.HasValue && variant.Id > 0)
            {
                environmentMap.SetPreviewVariant(variant.Id, now);
                await _environmentMapRepository.UpdateAsync(environmentMap, cancellationToken);
            }

            await _thumbnailQueue.EnqueueEnvironmentMapThumbnailAsync(environmentMap.Id, variant.Id, forceRegenerate: true, cancellationToken: cancellationToken);

            return Result.Success(new AddEnvironmentMapVariantResponse(
                variant.Id,
                resolvedFilesResult.Value.PreviewFile?.Id ?? 0,
                variant.SizeLabel,
                variant.ProjectionType.ToString().ToLowerInvariant()));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<AddEnvironmentMapVariantResponse>(new Error("EnvironmentMapVariantCreationFailed", ex.Message));
        }
        catch (InvalidOperationException ex)
        {
            return Result.Failure<AddEnvironmentMapVariantResponse>(new Error("BusinessRuleViolation", ex.Message));
        }
    }
}

public record AddEnvironmentMapVariantCommand(
    int EnvironmentMapId,
    int? FileId,
    string? SizeLabel,
    EnvironmentMapCubeFaceFileIds? CubeFaces) : ICommand<AddEnvironmentMapVariantResponse>;

public record AddEnvironmentMapVariantResponse(int VariantId, int FileId, string SizeLabel, string ProjectionType);
