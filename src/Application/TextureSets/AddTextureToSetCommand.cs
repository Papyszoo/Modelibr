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
    private readonly ILogger<AddTextureToTextureSetCommandHandler> _logger;

    public AddTextureToTextureSetCommandHandler(
        ITextureSetRepository textureSetRepository,
        IFileRepository fileRepository,
        IBatchUploadRepository batchUploadRepository,
        IDateTimeProvider dateTimeProvider,
        IThumbnailQueue thumbnailQueue,
        ILogger<AddTextureToTextureSetCommandHandler> logger)
    {
        _textureSetRepository = textureSetRepository;
        _fileRepository = fileRepository;
        _batchUploadRepository = batchUploadRepository;
        _dateTimeProvider = dateTimeProvider;
        _thumbnailQueue = thumbnailQueue;
        _logger = logger;
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
            if (command.TextureType != TextureType.SplitChannel)
            {
                textureSet.RemoveTextureOfType(command.TextureType, _dateTimeProvider.UtcNow);
            }

            // Add texture to the set (domain will enforce business rules)
            textureSet.AddTexture(texture, _dateTimeProvider.UtcNow);

            // Update the texture set
            var updatedTextureSet = await _textureSetRepository.UpdateAsync(textureSet, cancellationToken);

            // Update batch upload record to associate with texture set
            var batchUpload = await _batchUploadRepository.GetByFileIdAsync(command.FileId, cancellationToken);
            if (batchUpload != null)
            {
                batchUpload.TextureSetId = command.TextureSetId;
                await _batchUploadRepository.UpdateAsync(batchUpload, cancellationToken);
            }

            // Auto-enqueue thumbnail generation for Universal texture sets
            if (textureSet.Kind == TextureSetKind.Universal)
            {
                try
                {
                    await _thumbnailQueue.EnqueueTextureSetThumbnailAsync(command.TextureSetId, cancellationToken: cancellationToken);
                    _logger.LogInformation("Auto-enqueued thumbnail job for Universal texture set {TextureSetId}", command.TextureSetId);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to auto-enqueue thumbnail job for texture set {TextureSetId}, can be regenerated manually", command.TextureSetId);
                }
            }

            return Result.Success(new AddTextureToTextureSetResponse(texture.Id, texture.TextureType, texture.SourceChannel));
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
/// Response from adding a texture to a set.
/// </summary>
public record AddTextureToTextureSetResponse(int TextureId, TextureType TextureType, TextureChannel SourceChannel);