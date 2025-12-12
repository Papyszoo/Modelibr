using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Services;
using SharedKernel;

namespace Application.Models
{
    public record SetDefaultTextureSetCommand(int ModelId, int? TextureSetId, int? ModelVersionId = null) : ICommand<SetDefaultTextureSetResponse>;

    public record SetDefaultTextureSetResponse(int ModelId, int? ModelVersionId, int? DefaultTextureSetId);

    internal class SetDefaultTextureSetCommandHandler : ICommandHandler<SetDefaultTextureSetCommand, SetDefaultTextureSetResponse>
    {
        private readonly IModelRepository _modelRepository;
        private readonly IModelVersionRepository _modelVersionRepository;
        private readonly IThumbnailRepository _thumbnailRepository;
        private readonly IThumbnailQueue _thumbnailQueue;
        private readonly IDateTimeProvider _dateTimeProvider;

        public SetDefaultTextureSetCommandHandler(
            IModelRepository modelRepository,
            IModelVersionRepository modelVersionRepository,
            IThumbnailRepository thumbnailRepository,
            IThumbnailQueue thumbnailQueue,
            IDateTimeProvider dateTimeProvider)
        {
            _modelRepository = modelRepository;
            _modelVersionRepository = modelVersionRepository;
            _thumbnailRepository = thumbnailRepository;
            _thumbnailQueue = thumbnailQueue;
            _dateTimeProvider = dateTimeProvider;
        }

        public async Task<Result<SetDefaultTextureSetResponse>> Handle(SetDefaultTextureSetCommand command, CancellationToken cancellationToken)
        {
            var model = await _modelRepository.GetByIdAsync(command.ModelId, cancellationToken);

            if (model == null)
            {
                return Result.Failure<SetDefaultTextureSetResponse>(
                    new Error("ModelNotFound", $"Model with ID {command.ModelId} was not found."));
            }

            try
            {
                Domain.Models.ModelVersion? targetVersion;

                // Determine which version to update
                if (command.ModelVersionId.HasValue)
                {
                    targetVersion = await _modelVersionRepository.GetByIdAsync(command.ModelVersionId.Value, cancellationToken);
                    if (targetVersion == null)
                    {
                        return Result.Failure<SetDefaultTextureSetResponse>(
                            new Error("ModelVersionNotFound", $"Model version with ID {command.ModelVersionId.Value} was not found."));
                    }

                    if (targetVersion.ModelId != command.ModelId)
                    {
                        return Result.Failure<SetDefaultTextureSetResponse>(
                            new Error("ModelVersionMismatch", $"Model version {command.ModelVersionId.Value} does not belong to model {command.ModelId}."));
                    }
                }
                else
                {
                    // Use active version for backward compatibility
                    if (model.ActiveVersionId == null)
                    {
                        return Result.Failure<SetDefaultTextureSetResponse>(
                            new Error("NoActiveVersion", $"Model '{model.Name}' has no active version."));
                    }

                    targetVersion = model.ActiveVersion;
                    if (targetVersion == null)
                    {
                        return Result.Failure<SetDefaultTextureSetResponse>(
                            new Error("ActiveVersionNotLoaded", $"Active version for model '{model.Name}' could not be loaded."));
                    }
                }

                // Set default texture set on the model version
                var now = _dateTimeProvider.UtcNow;
                targetVersion.SetDefaultTextureSet(command.TextureSetId, now);
                await _modelVersionRepository.UpdateAsync(targetVersion, cancellationToken);

                // Regenerate thumbnail for the target version (applies default texture if set)
                var primaryFile = targetVersion.Files.FirstOrDefault();
                if (primaryFile != null)
                {
                    var currentTime = _dateTimeProvider.UtcNow;

                    // Reset existing thumbnail if it exists
                    if (targetVersion.Thumbnail != null)
                    {
                        targetVersion.Thumbnail.Reset(currentTime);
                        await _thumbnailRepository.UpdateAsync(targetVersion.Thumbnail, cancellationToken);
                    }

                    // Enqueue thumbnail job for this version
                    // EnqueueAsync will check for existing jobs for this specific version and reuse them
                    await _thumbnailQueue.EnqueueAsync(
                        command.ModelId,
                        targetVersion.Id,
                        primaryFile.Sha256Hash,
                        cancellationToken: cancellationToken);
                }

                return Result.Success(new SetDefaultTextureSetResponse(model.Id, targetVersion.Id, targetVersion.DefaultTextureSetId));
            }
            catch (InvalidOperationException ex)
            {
                return Result.Failure<SetDefaultTextureSetResponse>(
                    new Error("InvalidTextureSet", ex.Message));
            }
        }
    }
}
