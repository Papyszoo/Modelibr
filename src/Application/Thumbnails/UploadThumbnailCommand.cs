using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Storage;
using Domain.Files;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Thumbnails;

internal class UploadThumbnailCommandHandler : ICommandHandler<UploadThumbnailCommand, UploadThumbnailCommandResponse>
{
    private readonly IModelRepository _modelRepository;
    private readonly IThumbnailRepository _thumbnailRepository;
    private readonly IFileStorage _fileStorage;
    private readonly IUploadPathProvider _pathProvider;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UploadThumbnailCommandHandler(
        IModelRepository modelRepository,
        IThumbnailRepository thumbnailRepository,
        IFileStorage fileStorage,
        IUploadPathProvider pathProvider,
        IDateTimeProvider dateTimeProvider)
    {
        _modelRepository = modelRepository;
        _thumbnailRepository = thumbnailRepository;
        _fileStorage = fileStorage;
        _pathProvider = pathProvider;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<UploadThumbnailCommandResponse>> Handle(UploadThumbnailCommand command, CancellationToken cancellationToken)
    {
        // Get the model with versions
        var model = await _modelRepository.GetByIdAsync(command.ModelId, cancellationToken);
        if (model == null)
        {
            return Result.Failure<UploadThumbnailCommandResponse>(
                new Error("ModelNotFound", $"Model with ID {command.ModelId} was not found."));
        }

        // Get the latest version for the thumbnail
        var latestVersion = model.GetVersions().OrderByDescending(v => v.VersionNumber).FirstOrDefault();
        if (latestVersion == null)
        {
            return Result.Failure<UploadThumbnailCommandResponse>(
                new Error("NoVersionFound", "Model must have at least one version to upload a thumbnail."));
        }

        try
        {
            // Validate file is an image
            var isValidImage = IsValidImageContentType(command.ThumbnailFile.ContentType);
            if (!isValidImage)
            {
                return Result.Failure<UploadThumbnailCommandResponse>(
                    new Error("InvalidThumbnailFormat", "Thumbnail must be a valid image file (png, jpg, jpeg, webp)."));
            }

            // Store the thumbnail file using existing storage infrastructure
            var storedFileResult = await _fileStorage.SaveAsync(command.ThumbnailFile, FileType.Texture, cancellationToken);
            
            // Build the full path for the thumbnail
            var fullPath = Path.Combine(_pathProvider.UploadRootPath, storedFileResult.RelativePath);

            // Get image dimensions if possible (optional, can default to command values)
            var width = command.Width ?? 256; // Default width if not provided
            var height = command.Height ?? 256; // Default height if not provided

            // Update or create thumbnail for the latest version
            var now = _dateTimeProvider.UtcNow;
            
            if (latestVersion.Thumbnail == null)
            {
                var thumbnail = Thumbnail.Create(model.Id, latestVersion.Id, now);
                latestVersion.Thumbnail = await _thumbnailRepository.AddAsync(thumbnail, cancellationToken);
            }

            // Mark thumbnail as ready with the uploaded file details
            latestVersion.Thumbnail!.MarkAsReady(
                fullPath,
                storedFileResult.SizeBytes,
                width,
                height,
                now);

            await _thumbnailRepository.UpdateAsync(latestVersion.Thumbnail!, cancellationToken);

            return Result.Success(new UploadThumbnailCommandResponse(
                model.Id,
                fullPath,
                storedFileResult.SizeBytes,
                width,
                height));
        }
        catch (Exception ex)
        {
            return Result.Failure<UploadThumbnailCommandResponse>(
                new Error("ThumbnailUploadFailed", $"Failed to upload thumbnail: {ex.Message}"));
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

public record UploadThumbnailCommand(
    int ModelId,
    IFileUpload ThumbnailFile,
    int? Width = null,
    int? Height = null) : ICommand<UploadThumbnailCommandResponse>;

public record UploadThumbnailCommandResponse(
    int ModelId,
    string ThumbnailPath,
    long SizeBytes,
    int Width,
    int Height);