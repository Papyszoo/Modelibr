using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Application.Services;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.EnvironmentMaps;

internal sealed class AddEnvironmentMapVariantWithFileCommandHandler : ICommandHandler<AddEnvironmentMapVariantWithFileCommand, AddEnvironmentMapVariantResponse>
{
    private readonly IEnvironmentMapRepository _environmentMapRepository;
    private readonly IFileCreationService _fileCreationService;
    private readonly IEnvironmentMapSizeLabelService _sizeLabelService;
    private readonly IThumbnailQueue _thumbnailQueue;
    private readonly IDateTimeProvider _dateTimeProvider;

    public AddEnvironmentMapVariantWithFileCommandHandler(
        IEnvironmentMapRepository environmentMapRepository,
        IFileCreationService fileCreationService,
        IEnvironmentMapSizeLabelService sizeLabelService,
        IThumbnailQueue thumbnailQueue,
        IDateTimeProvider dateTimeProvider)
    {
        _environmentMapRepository = environmentMapRepository;
        _fileCreationService = fileCreationService;
        _sizeLabelService = sizeLabelService;
        _thumbnailQueue = thumbnailQueue;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<AddEnvironmentMapVariantResponse>> Handle(AddEnvironmentMapVariantWithFileCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var environmentMap = await _environmentMapRepository.GetByIdAsync(command.EnvironmentMapId, cancellationToken);
            if (environmentMap == null)
            {
                return Result.Failure<AddEnvironmentMapVariantResponse>(
                    new Error("EnvironmentMapNotFound", $"Environment map with ID {command.EnvironmentMapId} was not found."));
            }

            var now = _dateTimeProvider.UtcNow;
            var resolvedFilesResult = await EnvironmentMapVariantSupport.ResolveFromUploadsAsync(
                new EnvironmentMapVariantUploadInput(command.FileUpload, command.CubeFaces),
                _fileCreationService,
                cancellationToken);
            if (resolvedFilesResult.IsFailure)
                return Result.Failure<AddEnvironmentMapVariantResponse>(resolvedFilesResult.Error);

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

public record AddEnvironmentMapVariantWithFileCommand(
    int EnvironmentMapId,
    IFileUpload? FileUpload,
    EnvironmentMapCubeFaceUploads? CubeFaces,
    string? SizeLabel) : ICommand<AddEnvironmentMapVariantResponse>;
