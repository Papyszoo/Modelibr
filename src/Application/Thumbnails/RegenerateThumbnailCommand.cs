using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Thumbnails;

public class RegenerateThumbnailCommandHandler : ICommandHandler<RegenerateThumbnailCommand, RegenerateThumbnailCommandResponse>
{
    private readonly IModelRepository _modelRepository;
    private readonly IThumbnailRepository _thumbnailRepository;
    private readonly IThumbnailQueue _thumbnailQueue;
    private readonly IDateTimeProvider _dateTimeProvider;

    public RegenerateThumbnailCommandHandler(
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

    public async Task<Result<RegenerateThumbnailCommandResponse>> Handle(RegenerateThumbnailCommand command, CancellationToken cancellationToken)
    {
        var model = await _modelRepository.GetByIdAsync(command.ModelId, cancellationToken);
        
        if (model == null)
        {
            return Result.Failure<RegenerateThumbnailCommandResponse>(
                new Error("ModelNotFound", $"Model with ID {command.ModelId} was not found."));
        }

        // Determine which version to regenerate thumbnail for
        ModelVersion targetVersion;
        if (command.ModelVersionId.HasValue)
        {
            // Find the specified version
            targetVersion = model.Versions.FirstOrDefault(v => v.Id == command.ModelVersionId.Value);
            if (targetVersion == null)
            {
                return Result.Failure<RegenerateThumbnailCommandResponse>(
                    new Error("VersionNotFound", $"Version with ID {command.ModelVersionId.Value} was not found in model {command.ModelId}."));
            }
        }
        else
        {
            // Use active version
            if (model.ActiveVersion == null)
            {
                 return Result.Failure<RegenerateThumbnailCommandResponse>(
                    new Error("NoActiveVersion", $"Model {command.ModelId} has no active version."));
            }
            targetVersion = model.ActiveVersion;
        }

        // Get the version's primary file hash (needed for job deduplication)
        var primaryFile = targetVersion.Files.FirstOrDefault();
        if (primaryFile == null)
        {
            return Result.Failure<RegenerateThumbnailCommandResponse>(
                new Error("NoFilesFound", $"Version {targetVersion.Id} of model {command.ModelId} has no files to generate thumbnail from."));
        }

        var currentTime = _dateTimeProvider.UtcNow;

        // Reset existing thumbnail if it exists
        if (targetVersion.Thumbnail != null)
        {
            targetVersion.Thumbnail.Reset(currentTime);
            await _thumbnailRepository.UpdateAsync(targetVersion.Thumbnail, cancellationToken);
        }
        else
        {
            // Create new thumbnail record
            var newThumbnail = Thumbnail.Create(targetVersion.Id, currentTime);
            targetVersion.SetThumbnail(await _thumbnailRepository.AddAsync(newThumbnail, cancellationToken));
        }

        // Check if there's an existing job for this specific version
        var existingJob = await _thumbnailQueue.GetJobByModelHashAsync(primaryFile.Sha256Hash, cancellationToken);
        if (existingJob != null && existingJob.ModelVersionId == targetVersion.Id)
        {
            // Reuse existing job only if it's for the same version
            await _thumbnailQueue.RetryJobAsync(existingJob.Id, cancellationToken);
        }
        else
        {
            // Create new job for this version (even if another version has same model hash)
            await _thumbnailQueue.EnqueueAsync(model.Id, targetVersion.Id, primaryFile.Sha256Hash, cancellationToken: cancellationToken);
        }

        return Result.Success(new RegenerateThumbnailCommandResponse(model.Id, targetVersion.Id));
    }
}

public record RegenerateThumbnailCommand(int ModelId, int? ModelVersionId = null) : ICommand<RegenerateThumbnailCommandResponse>;

public record RegenerateThumbnailCommandResponse(int ModelId, int ModelVersionId);