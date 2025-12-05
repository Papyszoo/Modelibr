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

        if (model.ActiveVersion == null)
        {
             return Result.Failure<RegenerateThumbnailCommandResponse>(
                new Error("NoActiveVersion", $"Model {command.ModelId} has no active version."));
        }

        // Get the model's primary file hash (needed for job deduplication)
        var primaryFile = model.ActiveVersion.Files.FirstOrDefault();
        if (primaryFile == null)
        {
            return Result.Failure<RegenerateThumbnailCommandResponse>(
                new Error("NoFilesFound", $"Active version of model {command.ModelId} has no files to generate thumbnail from."));
        }

        var currentTime = _dateTimeProvider.UtcNow;

        // Reset existing thumbnail if it exists
        if (model.ActiveVersion.Thumbnail != null)
        {
            model.ActiveVersion.Thumbnail.Reset(currentTime);
            await _thumbnailRepository.UpdateAsync(model.ActiveVersion.Thumbnail, cancellationToken);
        }
        else
        {
            // Create new thumbnail record
            var newThumbnail = Thumbnail.Create(model.ActiveVersion.Id, currentTime);
            model.ActiveVersion.SetThumbnail(await _thumbnailRepository.AddAsync(newThumbnail, cancellationToken));
        }

        // Reset any existing job for this model and create new one
        var existingJob = await _thumbnailQueue.GetJobByModelHashAsync(primaryFile.Sha256Hash, cancellationToken);
        if (existingJob != null)
        {
            await _thumbnailQueue.RetryJobAsync(existingJob.Id, cancellationToken);
        }
        else
        {
            await _thumbnailQueue.EnqueueAsync(model.Id, model.ActiveVersion.Id, primaryFile.Sha256Hash, cancellationToken: cancellationToken);
        }

        return Result.Success(new RegenerateThumbnailCommandResponse(model.Id));
    }
}

public record RegenerateThumbnailCommand(int ModelId) : ICommand<RegenerateThumbnailCommandResponse>;

public record RegenerateThumbnailCommandResponse(int ModelId);