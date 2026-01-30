using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.RecycledFiles;

public record RestoreEntityCommand(
    string EntityType,
    int EntityId
) : ICommand<RestoreEntityResponse>;

public record RestoreEntityResponse(bool Success, string Message);

internal sealed class RestoreEntityCommandHandler : ICommandHandler<RestoreEntityCommand, RestoreEntityResponse>
{
    private readonly IModelRepository _modelRepository;
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IFileRepository _fileRepository;
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly ISpriteRepository _spriteRepository;
    private readonly ISoundRepository _soundRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public RestoreEntityCommandHandler(
        IModelRepository modelRepository,
        IModelVersionRepository modelVersionRepository,
        IFileRepository fileRepository,
        ITextureSetRepository textureSetRepository,
        ISpriteRepository spriteRepository,
        ISoundRepository soundRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _modelRepository = modelRepository;
        _modelVersionRepository = modelVersionRepository;
        _fileRepository = fileRepository;
        _textureSetRepository = textureSetRepository;
        _spriteRepository = spriteRepository;
        _soundRepository = soundRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<RestoreEntityResponse>> Handle(RestoreEntityCommand request, CancellationToken cancellationToken)
    {
        var now = _dateTimeProvider.UtcNow;

        switch (request.EntityType.ToLowerInvariant())
        {
            case "model":
                var model = await _modelRepository.GetDeletedByIdAsync(request.EntityId, cancellationToken);
                if (model == null)
                    return Result.Failure<RestoreEntityResponse>(new Error("ModelNotFound", "Model not found"));
                
                model.Restore(now);
                await _modelRepository.UpdateAsync(model, cancellationToken);
                return Result.Success(new RestoreEntityResponse(true, "Model restored successfully"));

            case "modelversion":
                var version = await _modelVersionRepository.GetDeletedByIdAsync(request.EntityId, cancellationToken);
                if (version == null)
                    return Result.Failure<RestoreEntityResponse>(new Error("VersionNotFound", "Model version not found"));
                
                version.Restore(now);
                await _modelVersionRepository.UpdateAsync(version, cancellationToken);
                return Result.Success(new RestoreEntityResponse(true, "Model version restored successfully"));

            case "file":
                var file = await _fileRepository.GetDeletedByIdAsync(request.EntityId, cancellationToken);
                if (file == null)
                    return Result.Failure<RestoreEntityResponse>(new Error("FileNotFound", "File not found"));
                
                file.Restore(now);
                await _fileRepository.UpdateAsync(file, cancellationToken);
                return Result.Success(new RestoreEntityResponse(true, "File restored successfully"));

            case "textureset":
                var textureSet = await _textureSetRepository.GetDeletedByIdAsync(request.EntityId, cancellationToken);
                if (textureSet == null)
                    return Result.Failure<RestoreEntityResponse>(new Error("TextureSetNotFound", "Texture set not found"));
                
                textureSet.Restore(now);
                await _textureSetRepository.UpdateAsync(textureSet, cancellationToken);
                return Result.Success(new RestoreEntityResponse(true, "Texture set restored successfully"));

            case "sprite":
                var sprite = await _spriteRepository.GetDeletedByIdAsync(request.EntityId, cancellationToken);
                if (sprite == null)
                    return Result.Failure<RestoreEntityResponse>(new Error("SpriteNotFound", "Sprite not found"));
                
                sprite.Restore(now);
                await _spriteRepository.UpdateAsync(sprite, cancellationToken);
                return Result.Success(new RestoreEntityResponse(true, "Sprite restored successfully"));

            case "sound":
                var sound = await _soundRepository.GetDeletedByIdAsync(request.EntityId, cancellationToken);
                if (sound == null)
                    return Result.Failure<RestoreEntityResponse>(new Error("SoundNotFound", "Sound not found"));
                
                sound.Restore(now);
                await _soundRepository.UpdateAsync(sound, cancellationToken);
                return Result.Success(new RestoreEntityResponse(true, "Sound restored successfully"));

            default:
                return Result.Failure<RestoreEntityResponse>(new Error("InvalidEntityType", $"Unknown entity type: {request.EntityType}"));
        }
    }
}
