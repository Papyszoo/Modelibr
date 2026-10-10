using Application.Abstractions;
using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Storage;
using Domain.Files;
using Domain.Services;
using SharedKernel;

namespace Application.Vfx;

/// <summary>
/// Stores the animated WebP the worker rendered for an effect and points the effect at it.
/// The previous thumbnail file is left where it is: storage is content-addressed, so the
/// file may be shared, and replacing the path is what makes the new picture current.
/// </summary>
public record UploadVfxThumbnailCommand(
    int VfxId,
    IFileUpload ThumbnailFile) : ICommand<UploadVfxThumbnailResponse>;

public record UploadVfxThumbnailResponse(int VfxId, string ThumbnailPath, long SizeBytes);

internal sealed class UploadVfxThumbnailCommandHandler
    : ICommandHandler<UploadVfxThumbnailCommand, UploadVfxThumbnailResponse>
{
    private readonly IVfxRepository _vfxRepository;
    private readonly IFileStorage _fileStorage;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IUnitOfWork _unitOfWork;

    public UploadVfxThumbnailCommandHandler(
        IVfxRepository vfxRepository,
        IFileStorage fileStorage,
        IDateTimeProvider dateTimeProvider,
        IUnitOfWork unitOfWork)
    {
        _vfxRepository = vfxRepository;
        _fileStorage = fileStorage;
        _dateTimeProvider = dateTimeProvider;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<UploadVfxThumbnailResponse>> Handle(
        UploadVfxThumbnailCommand command,
        CancellationToken cancellationToken)
    {
        var vfx = await _vfxRepository.GetByIdAsync(command.VfxId, cancellationToken);
        if (vfx is null)
        {
            return Result.Failure<UploadVfxThumbnailResponse>(
                new Error("VfxNotFound", $"Vfx with ID {command.VfxId} was not found."));
        }

        if (!string.Equals(command.ThumbnailFile.ContentType, "image/webp", StringComparison.OrdinalIgnoreCase))
        {
            return Result.Failure<UploadVfxThumbnailResponse>(
                new Error("InvalidThumbnailType", "A vfx thumbnail must be an image/webp file."));
        }

        try
        {
            var stored = await _fileStorage.SaveAsync(command.ThumbnailFile, FileType.Texture, cancellationToken);
            // Uploads-relative, like every other stored file; the serving endpoint rebases it.
            var relativePath = stored.RelativePath;

            vfx.SetThumbnailPath(relativePath, _dateTimeProvider.UtcNow);
            await _vfxRepository.UpdateAsync(vfx, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);

            return Result.Success(new UploadVfxThumbnailResponse(vfx.Id, relativePath, stored.SizeBytes));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return Result.Failure<UploadVfxThumbnailResponse>(
                new Error("VfxThumbnailUploadFailed", $"Failed to upload vfx thumbnail: {ex.Message}"));
        }
    }
}
