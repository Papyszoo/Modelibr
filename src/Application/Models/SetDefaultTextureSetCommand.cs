using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Services;
using SharedKernel;

namespace Application.Models
{
    public record SetDefaultTextureSetCommand(int ModelId, int? TextureSetId) : ICommand<SetDefaultTextureSetResponse>;

    public record SetDefaultTextureSetResponse(int ModelId, int? DefaultTextureSetId);

    internal class SetDefaultTextureSetCommandHandler : ICommandHandler<SetDefaultTextureSetCommand, SetDefaultTextureSetResponse>
    {
        private readonly IModelRepository _modelRepository;
        private readonly IThumbnailRepository _thumbnailRepository;
        private readonly IThumbnailQueue _thumbnailQueue;
        private readonly IDateTimeProvider _dateTimeProvider;

        public SetDefaultTextureSetCommandHandler(
            IModelRepository modelRepository,
            IThumbnailRepository thumbnailRepository,
            IThumbnailQueue thumbnailQueue,
            IDateTimeProvider dateTimeProvider)
        {
            _modelRepository = modelRepository;
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
                model.SetDefaultTextureSet(command.TextureSetId, _dateTimeProvider.UtcNow);
                await _modelRepository.UpdateAsync(model, cancellationToken);

                // Cancel any active thumbnail jobs for this model
                await _thumbnailQueue.CancelActiveJobsForModelAsync(command.ModelId, cancellationToken);

                // Get the model's primary file hash for thumbnail generation
                var primaryFile = model.Files.FirstOrDefault();
                if (primaryFile != null)
                {
                    var currentTime = _dateTimeProvider.UtcNow;

                    // Get the latest version for thumbnail regeneration
                    var latestVersion = model.GetVersions().OrderByDescending(v => v.VersionNumber).FirstOrDefault();
                    if (latestVersion != null)
                    {
                        // Reset existing thumbnail if it exists
                        if (latestVersion.Thumbnail != null)
                        {
                            latestVersion.Thumbnail.Reset(currentTime);
                            await _thumbnailRepository.UpdateAsync(latestVersion.Thumbnail, cancellationToken);
                        }

                        // Reset any existing job for this version and create new one
                        var existingJob = await _thumbnailQueue.GetJobByModelVersionIdAsync(latestVersion.Id, cancellationToken);
                        if (existingJob != null)
                        {
                            await _thumbnailQueue.RetryJobAsync(existingJob.Id, cancellationToken);
                        }
                        else
                        {
                            await _thumbnailQueue.EnqueueAsync(
                                command.ModelId,
                                latestVersion.Id,
                                primaryFile.Sha256Hash,
                                cancellationToken: cancellationToken);
                        }
                    }
                }

                return Result.Success(new SetDefaultTextureSetResponse(model.Id, model.DefaultTextureSetId));
            }
            catch (InvalidOperationException ex)
            {
                return Result.Failure<SetDefaultTextureSetResponse>(
                    new Error("InvalidTextureSet", ex.Message));
            }
        }
    }
}
