using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using Microsoft.Extensions.Logging;
using SharedKernel;

namespace Application.TextureSets;

internal class AddTextureToTextureSetCommandHandler : ICommandHandler<AddTextureToTextureSetCommand, AddTextureToTextureSetResponse>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IFileRepository _fileRepository;
    private readonly IBatchUploadRepository _batchUploadRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IThumbnailQueue _thumbnailQueue;
    private readonly ITextureImageMetadataReader _textureImageMetadataReader;
    private readonly ILogger<AddTextureToTextureSetCommandHandler> _logger;
    private readonly IUnitOfWork _unitOfWork;

    public AddTextureToTextureSetCommandHandler(
        ITextureSetRepository textureSetRepository,
        IFileRepository fileRepository,
        IBatchUploadRepository batchUploadRepository,
        IDateTimeProvider dateTimeProvider,
        IThumbnailQueue thumbnailQueue,
        ITextureImageMetadataReader textureImageMetadataReader,
        ILogger<AddTextureToTextureSetCommandHandler> logger,
        IUnitOfWork unitOfWork)
    {
        _textureSetRepository = textureSetRepository;
        _fileRepository = fileRepository;
        _batchUploadRepository = batchUploadRepository;
        _dateTimeProvider = dateTimeProvider;
        _thumbnailQueue = thumbnailQueue;
        _textureImageMetadataReader = textureImageMetadataReader;
        _logger = logger;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<AddTextureToTextureSetResponse>> Handle(AddTextureToTextureSetCommand command, CancellationToken cancellationToken)
    {
        try
        {
            // Get the texture set
            var textureSet = await _textureSetRepository.GetByIdAsync(command.TextureSetId, cancellationToken);
            if (textureSet == null)
            {
                return Result.Failure<AddTextureToTextureSetResponse>(
                    new Error("TextureSetNotFound", $"Texture set with ID {command.TextureSetId} was not found."));
            }

            // Get the file
            var file = await _fileRepository.GetByIdAsync(command.FileId, cancellationToken);
            if (file == null)
            {
                return Result.Failure<AddTextureToTextureSetResponse>(
                    new Error("FileNotFound", $"File with ID {command.FileId} was not found."));
            }

            // Validate texture type
            var textureTypeResult = command.TextureType.ValidateForStorage();
            if (textureTypeResult.IsFailure)
            {
                return Result.Failure<AddTextureToTextureSetResponse>(textureTypeResult.Error);
            }

            // Create the texture using domain factory method
            // If SourceChannel is provided, use the overload with channel; otherwise use default
            var texture = command.SourceChannel.HasValue
                ? Domain.Models.Texture.Create(file, command.TextureType, command.SourceChannel.Value, _dateTimeProvider.UtcNow)
                : Domain.Models.Texture.Create(file, command.TextureType, _dateTimeProvider.UtcNow);

            // Remove existing texture of the same type if it exists (for replacement)
            // But skip this for "SplitChannel" type, as we allow multiple unassigned textures
            //
            // What gets displaced is reported back, because this is a REPLACEMENT that reads
            // like an addition. An agent write recorded only the texture it added, so undoing
            // it removed that one and left the set permanently short the map it had evicted -
            // reported as reversed, with the original gone. Nothing else can reconstruct it
            // afterwards, so it is captured here, at the only moment it still exists.
            ReplacedTextureChannel? replaced = null;
            if (command.TextureType != TextureType.SplitChannel)
            {
                var displaced = textureSet.Textures.FirstOrDefault(t => t.TextureType == command.TextureType);
                if (displaced is not null)
                {
                    replaced = new ReplacedTextureChannel(
                        displaced.Id, displaced.FileId, displaced.TextureType, displaced.SourceChannel);
                }

                textureSet.RemoveTextureOfType(command.TextureType, _dateTimeProvider.UtcNow);
            }

            // Add texture to the set (domain will enforce business rules)
            textureSet.AddTexture(texture, _dateTimeProvider.UtcNow);

            // Non-Universal sets never get a worker thumbnail pass, so capture the
            // source-image resolution here at upload time. Universal sets get this
            // from the worker job (enqueued below) instead.
            if (textureSet.Kind != TextureSetKind.Universal)
            {
                await ApplyImageMetadataAsync(texture, file, cancellationToken);
            }

            // Update the texture set
            var updatedTextureSet = await _textureSetRepository.UpdateAsync(textureSet, cancellationToken);

            // Update batch upload record to associate with texture set, if one
            // exists for this file (uploads that go through the merge/split-
            // channel flow reuse an existing FileId with no BatchUpload row at
            // all - that's the normal case, not an error).
            var batchUpload = await _batchUploadRepository.GetByFileIdAsync(command.FileId, cancellationToken);
            if (batchUpload != null)
            {
                batchUpload.TextureSetId = command.TextureSetId;
                await _batchUploadRepository.UpdateAsync(batchUpload, cancellationToken);
            }

            // Commit unconditionally: texture.Id is database-assigned and read
            // in the response below, and the texture set/texture mutations
            // above must persist regardless of whether a batch upload record
            // existed to update. Previously this commit lived only inside the
            // `if (batchUpload != null)` block above, so the merge/split-
            // channel flow - which adds textures for a FileId with no
            // BatchUpload row - silently never persisted anything (CI:
            // "Merge ORM packed texture using Split Channels").
            await _unitOfWork.SaveChangesAsync(cancellationToken);

            // Auto-enqueue thumbnail generation for Universal texture sets
            if (textureSet.Kind == TextureSetKind.Universal)
            {
                try
                {
                    await _thumbnailQueue.EnqueueTextureSetThumbnailAsync(command.TextureSetId, forceRegenerate: true, cancellationToken: cancellationToken);
                    _logger.LogInformation("Auto-enqueued thumbnail job for Universal texture set {TextureSetId}", command.TextureSetId);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to auto-enqueue thumbnail job for texture set {TextureSetId}, can be regenerated manually", command.TextureSetId);
                }
            }

            return Result.Success(new AddTextureToTextureSetResponse(
                texture.Id, texture.TextureType, texture.SourceChannel, command.TextureSetId, replaced));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<AddTextureToTextureSetResponse>(
                new Error("AddTextureToTextureSetFailed", ex.Message));
        }
        catch (InvalidOperationException ex)
        {
            return Result.Failure<AddTextureToTextureSetResponse>(
                new Error("BusinessRuleViolation", ex.Message));
        }
    }

    private async Task ApplyImageMetadataAsync(Domain.Models.Texture texture, Domain.Models.File file, CancellationToken cancellationToken)
    {
        var metadata = await _textureImageMetadataReader.ReadAsync(file, cancellationToken);
        if (metadata != null)
        {
            texture.SetImageMetadata(metadata.Width, metadata.Height, metadata.Format, _dateTimeProvider.UtcNow);
        }
    }
}

/// <summary>
/// Command to add a texture to a texture set with optional source channel.
/// </summary>
/// <param name="TextureSetId">The texture set to add to</param>
/// <param name="FileId">The file containing the texture</param>
/// <param name="TextureType">The type of texture (Albedo, Normal, etc.)</param>
/// <param name="SourceChannel">Optional source channel for channel-packed textures (R, G, B, A, or RGB)</param>
public record AddTextureToTextureSetCommand(
    int TextureSetId, 
    int FileId, 
    TextureType TextureType,
    TextureChannel? SourceChannel = null
) : ICommand<AddTextureToTextureSetResponse>;

/// <summary>
/// A texture an add displaced, so the write can be undone by putting it back.
/// </summary>
public record ReplacedTextureChannel(int TextureId, int FileId, TextureType TextureType, TextureChannel SourceChannel);

/// <summary>
/// Response from adding a texture to a set.
/// </summary>
/// <param name="TextureSetId">The set the texture landed in - carried so an audited HTTP upload can record which asset it changed.</param>
/// <param name="ReplacedTexture">The same-typed texture this add evicted, or null when the slot was free.</param>
public record AddTextureToTextureSetResponse(
    int TextureId,
    TextureType TextureType,
    TextureChannel SourceChannel,
    int TextureSetId = 0,
    ReplacedTextureChannel? ReplacedTexture = null);