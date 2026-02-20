using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Storage;
using Domain.Files;
using Domain.Services;
using SharedKernel;

namespace Application.Thumbnails;

internal class UploadTextureSetThumbnailCommandHandler : ICommandHandler<UploadTextureSetThumbnailCommand, UploadTextureSetThumbnailCommandResponse>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IFileStorage _fileStorage;
    private readonly IUploadPathProvider _pathProvider;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UploadTextureSetThumbnailCommandHandler(
        ITextureSetRepository textureSetRepository,
        IFileStorage fileStorage,
        IUploadPathProvider pathProvider,
        IDateTimeProvider dateTimeProvider)
    {
        _textureSetRepository = textureSetRepository;
        _fileStorage = fileStorage;
        _pathProvider = pathProvider;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<UploadTextureSetThumbnailCommandResponse>> Handle(UploadTextureSetThumbnailCommand command, CancellationToken cancellationToken)
    {
        var textureSet = await _textureSetRepository.GetByIdAsync(command.TextureSetId, cancellationToken);
        if (textureSet == null)
        {
            return Result.Failure<UploadTextureSetThumbnailCommandResponse>(
                new Error("TextureSetNotFound", $"Texture set with ID {command.TextureSetId} was not found."));
        }

        try
        {
            var storedFileResult = await _fileStorage.SaveAsync(command.ThumbnailFile, FileType.Texture, cancellationToken);
            var fullPath = Path.Combine(_pathProvider.UploadRootPath, storedFileResult.RelativePath);

            var now = _dateTimeProvider.UtcNow;

            if (command.IsPng)
            {
                textureSet.SetPngThumbnailPath(fullPath, now);
            }
            else
            {
                textureSet.SetThumbnailPath(fullPath, now);
            }

            await _textureSetRepository.UpdateAsync(textureSet, cancellationToken);

            return Result.Success(new UploadTextureSetThumbnailCommandResponse(
                command.TextureSetId,
                fullPath,
                storedFileResult.SizeBytes));
        }
        catch (Exception ex)
        {
            return Result.Failure<UploadTextureSetThumbnailCommandResponse>(
                new Error("TextureSetThumbnailUploadFailed", $"Failed to upload texture set thumbnail: {ex.Message}"));
        }
    }
}

public record UploadTextureSetThumbnailCommand(
    int TextureSetId,
    IFileUpload ThumbnailFile,
    bool IsPng = false) : ICommand<UploadTextureSetThumbnailCommandResponse>;

public record UploadTextureSetThumbnailCommandResponse(
    int TextureSetId,
    string ThumbnailPath,
    long SizeBytes);
