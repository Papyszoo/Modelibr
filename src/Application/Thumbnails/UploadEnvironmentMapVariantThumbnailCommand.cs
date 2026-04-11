using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Storage;
using Domain.Files;
using Domain.Services;
using SharedKernel;

namespace Application.Thumbnails;

internal sealed class UploadEnvironmentMapVariantThumbnailCommandHandler
    : ICommandHandler<UploadEnvironmentMapVariantThumbnailCommand, UploadEnvironmentMapVariantThumbnailCommandResponse>
{
    private readonly IEnvironmentMapRepository _environmentMapRepository;
    private readonly IFileStorage _fileStorage;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UploadEnvironmentMapVariantThumbnailCommandHandler(
        IEnvironmentMapRepository environmentMapRepository,
        IFileStorage fileStorage,
        IDateTimeProvider dateTimeProvider)
    {
        _environmentMapRepository = environmentMapRepository;
        _fileStorage = fileStorage;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<UploadEnvironmentMapVariantThumbnailCommandResponse>> Handle(
        UploadEnvironmentMapVariantThumbnailCommand command,
        CancellationToken cancellationToken)
    {
        var environmentMap = await _environmentMapRepository.GetByIdAsync(command.EnvironmentMapId, cancellationToken);
        if (environmentMap == null)
        {
            return Result.Failure<UploadEnvironmentMapVariantThumbnailCommandResponse>(
                new Error("EnvironmentMapNotFound", $"Environment map with ID {command.EnvironmentMapId} was not found."));
        }

        var variant = environmentMap.GetVariant(command.VariantId);
        if (variant == null)
        {
            return Result.Failure<UploadEnvironmentMapVariantThumbnailCommandResponse>(
                new Error("EnvironmentMapVariantNotFound", $"Environment map variant with ID {command.VariantId} was not found."));
        }

        if (!IsValidImageContentType(command.ThumbnailFile.ContentType))
        {
            return Result.Failure<UploadEnvironmentMapVariantThumbnailCommandResponse>(
                new Error("InvalidThumbnailFormat", "Thumbnail must be a valid image file (png, jpg, jpeg, webp)."));
        }

        try
        {
            var storedFileResult = await _fileStorage.SaveAsync(command.ThumbnailFile, FileType.Texture, cancellationToken);
            var now = _dateTimeProvider.UtcNow;

            variant.SetThumbnailPath(storedFileResult.RelativePath, now);
            environmentMap.Touch(now);

            await _environmentMapRepository.UpdateAsync(environmentMap, cancellationToken);

            return Result.Success(new UploadEnvironmentMapVariantThumbnailCommandResponse(
                command.EnvironmentMapId,
                command.VariantId,
                storedFileResult.RelativePath,
                storedFileResult.SizeBytes));
        }
        catch (Exception ex)
        {
            return Result.Failure<UploadEnvironmentMapVariantThumbnailCommandResponse>(
                new Error("EnvironmentMapThumbnailUploadFailed", $"Failed to upload environment map thumbnail: {ex.Message}"));
        }
    }

    private static bool IsValidImageContentType(string contentType)
    {
        return contentType.ToLowerInvariant() switch
        {
            "image/png" => true,
            "image/jpeg" => true,
            "image/jpg" => true,
            "image/webp" => true,
            _ => false
        };
    }
}

public record UploadEnvironmentMapVariantThumbnailCommand(
    int EnvironmentMapId,
    int VariantId,
    IFileUpload ThumbnailFile) : ICommand<UploadEnvironmentMapVariantThumbnailCommandResponse>;

public record UploadEnvironmentMapVariantThumbnailCommandResponse(
    int EnvironmentMapId,
    int VariantId,
    string ThumbnailPath,
    long SizeBytes);
