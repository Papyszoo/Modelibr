using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.TextureSets;

internal class UpdateTextureSetTilingScaleCommandHandler : ICommandHandler<UpdateTextureSetTilingScaleCommand, UpdateTextureSetTilingScaleResponse>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateTextureSetTilingScaleCommandHandler(
        ITextureSetRepository textureSetRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _textureSetRepository = textureSetRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<UpdateTextureSetTilingScaleResponse>> Handle(UpdateTextureSetTilingScaleCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var textureSet = await _textureSetRepository.GetByIdAsync(command.TextureSetId, cancellationToken);
            if (textureSet == null)
            {
                return Result.Failure<UpdateTextureSetTilingScaleResponse>(
                    new Error("TextureSetNotFound", $"Texture set with ID {command.TextureSetId} was not found."));
            }

            textureSet.UpdateTilingScale(command.TilingScaleX, command.TilingScaleY, _dateTimeProvider.UtcNow);

            // Update UV mapping if provided
            if (command.UvMappingMode.HasValue)
            {
                textureSet.UpdateUvMapping(
                    command.UvMappingMode.Value,
                    command.UvScale ?? textureSet.UvScale,
                    _dateTimeProvider.UtcNow);
            }
            else if (command.UvScale.HasValue)
            {
                textureSet.UpdateUvMapping(
                    textureSet.UvMappingMode,
                    command.UvScale.Value,
                    _dateTimeProvider.UtcNow);
            }

            await _textureSetRepository.UpdateAsync(textureSet, cancellationToken);

            return Result.Success(new UpdateTextureSetTilingScaleResponse(
                textureSet.Id,
                textureSet.TilingScaleX,
                textureSet.TilingScaleY,
                textureSet.UvMappingMode,
                textureSet.UvScale));
        }
        catch (InvalidOperationException ex)
        {
            return Result.Failure<UpdateTextureSetTilingScaleResponse>(
                new Error("BusinessRuleViolation", ex.Message));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<UpdateTextureSetTilingScaleResponse>(
                new Error("ValidationFailed", ex.Message));
        }
    }
}

public record UpdateTextureSetTilingScaleCommand(
    int TextureSetId,
    float TilingScaleX,
    float TilingScaleY,
    UvMappingMode? UvMappingMode = null,
    float? UvScale = null) : ICommand<UpdateTextureSetTilingScaleResponse>;

public record UpdateTextureSetTilingScaleResponse(
    int Id,
    float TilingScaleX,
    float TilingScaleY,
    UvMappingMode UvMappingMode,
    float UvScale);
