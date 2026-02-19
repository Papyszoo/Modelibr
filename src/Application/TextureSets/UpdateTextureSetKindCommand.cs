using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Services;
using Domain.ValueObjects;
using Microsoft.Extensions.Logging;
using SharedKernel;

namespace Application.TextureSets;

internal class UpdateTextureSetKindCommandHandler : ICommandHandler<UpdateTextureSetKindCommand, UpdateTextureSetKindResponse>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IThumbnailQueue _thumbnailQueue;
    private readonly ILogger<UpdateTextureSetKindCommandHandler> _logger;

    public UpdateTextureSetKindCommandHandler(
        ITextureSetRepository textureSetRepository,
        IDateTimeProvider dateTimeProvider,
        IThumbnailQueue thumbnailQueue,
        ILogger<UpdateTextureSetKindCommandHandler> logger)
    {
        _textureSetRepository = textureSetRepository;
        _dateTimeProvider = dateTimeProvider;
        _thumbnailQueue = thumbnailQueue;
        _logger = logger;
    }

    public async Task<Result<UpdateTextureSetKindResponse>> Handle(UpdateTextureSetKindCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var textureSet = await _textureSetRepository.GetByIdAsync(command.Id, cancellationToken);
            if (textureSet == null)
            {
                return Result.Failure<UpdateTextureSetKindResponse>(
                    new Error("TextureSetNotFound", $"Texture set with ID {command.Id} was not found."));
            }

            textureSet.UpdateKind(command.Kind, _dateTimeProvider.UtcNow);
            var updated = await _textureSetRepository.UpdateAsync(textureSet, cancellationToken);

            // Auto-enqueue thumbnail generation when kind changes to Universal
            if (command.Kind == TextureSetKind.Universal)
            {
                try
                {
                    await _thumbnailQueue.EnqueueTextureSetThumbnailAsync(command.Id, cancellationToken: cancellationToken);
                    _logger.LogInformation("Auto-enqueued thumbnail job for texture set {TextureSetId} after kind change to Universal", command.Id);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to auto-enqueue thumbnail job for texture set {TextureSetId}, can be regenerated manually", command.Id);
                }
            }

            return Result.Success(new UpdateTextureSetKindResponse(updated.Id, updated.Kind));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<UpdateTextureSetKindResponse>(
                new Error("UpdateTextureSetKindFailed", ex.Message));
        }
    }
}

public record UpdateTextureSetKindCommand(int Id, TextureSetKind Kind) : ICommand<UpdateTextureSetKindResponse>;
public record UpdateTextureSetKindResponse(int Id, TextureSetKind Kind);
