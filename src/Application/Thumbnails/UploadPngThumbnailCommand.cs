using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Storage;
using Domain.Files;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Thumbnails;

internal class UploadPngThumbnailCommandHandler : ICommandHandler<UploadPngThumbnailCommand, UploadPngThumbnailCommandResponse>
{
    private readonly IModelRepository _modelRepository;
    private readonly IThumbnailRepository _thumbnailRepository;
    private readonly IFileStorage _fileStorage;
    private readonly IUploadPathProvider _pathProvider;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UploadPngThumbnailCommandHandler(
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

    public async Task<Result<UploadPngThumbnailCommandResponse>> Handle(UploadPngThumbnailCommand command, CancellationToken cancellationToken)
    {
        // Get the model
        var model = await _modelRepository.GetByIdAsync(command.ModelId, cancellationToken);
        if (model == null)
        {
            return Result.Failure<UploadPngThumbnailCommandResponse>(
                new Error("ModelNotFound", $"Model with ID {command.ModelId} was not found."));
        }

        // Get the specified version
        var targetVersion = model.Versions.FirstOrDefault(v => v.Id == command.ModelVersionId);
        if (targetVersion == null)
        {
            return Result.Failure<UploadPngThumbnailCommandResponse>(
                new Error("VersionNotFound", $"Model version with ID {command.ModelVersionId} was not found."));
        }

        try
        {
            // Validate file is PNG
            if (command.PngFile.ContentType.ToLowerInvariant() != "image/png")
            {
                return Result.Failure<UploadPngThumbnailCommandResponse>(
                    new Error("InvalidFormat", "PNG thumbnail must be image/png format."));
            }

            // Store the PNG file using existing storage infrastructure
            var storedFileResult = await _fileStorage.SaveAsync(command.PngFile, FileType.Texture, cancellationToken);
            
            // Build the full path for the PNG thumbnail
            var fullPath = Path.Combine(_pathProvider.UploadRootPath, storedFileResult.RelativePath);

            // Get image dimensions if possible (optional, can default to command values)
            var width = command.Width ?? 256; // Default width if not provided
            var height = command.Height ?? 256; // Default height if not provided

            // Update or create thumbnail for the specified version
            var now = _dateTimeProvider.UtcNow;
            
            if (targetVersion.Thumbnail == null)
            {
                var thumbnail = Thumbnail.Create(targetVersion.Id, now);
                var createdThumbnail = await _thumbnailRepository.AddAsync(thumbnail, cancellationToken);
                targetVersion.SetThumbnail(createdThumbnail);
                await _modelRepository.UpdateAsync(model, cancellationToken); // Save ThumbnailId to ModelVersion
            }

            // Mark PNG thumbnail path - use overloaded method if WebP already exists
            if (string.IsNullOrEmpty(targetVersion.Thumbnail!.ThumbnailPath))
            {
                // No WebP yet, set PNG as primary
                targetVersion.Thumbnail!.MarkAsReady(
                    fullPath,
                    storedFileResult.SizeBytes,
                    width,
                    height,
                    now);
            }
            else
            {
                // WebP exists, set PNG separately using overloaded method
                targetVersion.Thumbnail!.MarkAsReady(
                    targetVersion.Thumbnail!.ThumbnailPath!, // thumbnailPath
                    fullPath, // pngThumbnailPath
                    targetVersion.Thumbnail!.SizeBytes!.Value, // sizeBytes
                    targetVersion.Thumbnail!.Width!.Value, // width
                    targetVersion.Thumbnail!.Height!.Value, // height
                    now); // processedAt
            }

            await _thumbnailRepository.UpdateAsync(targetVersion.Thumbnail!, cancellationToken);

            return Result.Success(new UploadPngThumbnailCommandResponse(
                model.Id,
                fullPath,
                storedFileResult.SizeBytes,
                width,
                height));
        }
        catch (Exception ex)
        {
            return Result.Failure<UploadPngThumbnailCommandResponse>(
                new Error("PngThumbnailUploadFailed", $"Failed to upload PNG thumbnail: {ex.Message}"));
        }
    }
}

public record UploadPngThumbnailCommand(
    int ModelId,
    int ModelVersionId,
    IFileUpload PngFile,
    int? Width = null,
    int? Height = null) : ICommand<UploadPngThumbnailCommandResponse>;

public record UploadPngThumbnailCommandResponse(
    int ModelId,
    string PngThumbnailPath,
    long SizeBytes,
    int Width,
    int Height);
