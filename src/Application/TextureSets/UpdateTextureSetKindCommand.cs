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
    private readonly IBlendFileGenerator _blendFileGenerator;
    private readonly ILogger<UpdateTextureSetKindCommandHandler> _logger;

    public UpdateTextureSetKindCommandHandler(
        ITextureSetRepository textureSetRepository,
        IDateTimeProvider dateTimeProvider,
        IThumbnailQueue thumbnailQueue,
        IBlendFileGenerator blendFileGenerator,
        ILogger<UpdateTextureSetKindCommandHandler> logger)
    {
        _textureSetRepository = textureSetRepository;
        _dateTimeProvider = dateTimeProvider;
        _thumbnailQueue = thumbnailQueue;
        _blendFileGenerator = blendFileGenerator;
        _logger = logger;
    }

    public async Task<Result<UpdateTextureSetKindResponse>> Handle(UpdateTextureSetKindCommand command, CancellationToken cancellationToken)
    {
        try
        {
            if (!Enum.IsDefined(typeof(TextureSetKind), command.Kind))
            {
                return Result.Failure<UpdateTextureSetKindResponse>(
                    new Error("InvalidTextureSetKind", $"'{(int)command.Kind}' is not a valid texture set kind."));
            }

            // A single-model (ModelOwned) set must be tied to exactly one model,
            // so the owner must be known — otherwise the set could end up
            // ModelOwned while still linked to several models.
            if (command.Kind == TextureSetKind.ModelOwned && !command.OwnerModelId.HasValue)
            {
                return Result.Failure<UpdateTextureSetKindResponse>(
                    new Error("OwnerModelIdRequired", "Converting a texture set to Single Model requires an owner model id."));
            }

            var textureSet = await _textureSetRepository.GetByIdAsync(command.Id, cancellationToken);
            if (textureSet == null)
            {
                return Result.Failure<UpdateTextureSetKindResponse>(
                    new Error("TextureSetNotFound", $"Texture set with ID {command.Id} was not found."));
            }

            textureSet.UpdateKind(command.Kind, _dateTimeProvider.UtcNow);

            // Converting to a single-model (ModelOwned) kind ties the texture
            // set to exactly one model — drop links to every other model.
            if (command.Kind == TextureSetKind.ModelOwned)
            {
                var removed = textureSet.RemoveModelVersionsNotOwnedBy(
                    command.OwnerModelId.Value, _dateTimeProvider.UtcNow);

                // Invalidate each unlinked model version's cached .blend so it
                // regenerates without the removed texture set (mirrors the
                // disassociate-from-model-version flow).
                foreach (var mapping in removed.DistinctBy(m => m.ModelVersionId))
                {
                    _blendFileGenerator.InvalidateCache(
                        mapping.ModelVersion.Model.Id, mapping.ModelVersionId);
                }
            }

            var updated = await _textureSetRepository.UpdateAsync(textureSet, cancellationToken);

            // Auto-enqueue thumbnail generation when kind changes to Universal
            if (command.Kind == TextureSetKind.Universal)
            {
                try
                {
                    await _thumbnailQueue.EnqueueTextureSetThumbnailAsync(command.Id, forceRegenerate: true, cancellationToken: cancellationToken);
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

public record UpdateTextureSetKindCommand(int Id, TextureSetKind Kind, int? OwnerModelId = null) : ICommand<UpdateTextureSetKindResponse>;
public record UpdateTextureSetKindResponse(int Id, TextureSetKind Kind);
