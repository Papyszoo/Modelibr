using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Models;
using Domain.Services;
using SharedKernel;

namespace Application.Thumbnails;

public class RegenerateAllThumbnailsCommandHandler
    : ICommandHandler<RegenerateAllThumbnailsCommand, RegenerateAllThumbnailsCommandResponse>
{
    private readonly IModelRepository _modelRepository;
    private readonly IThumbnailRepository _thumbnailRepository;
    private readonly IThumbnailQueue _thumbnailQueue;
    private readonly IDateTimeProvider _dateTimeProvider;

    public RegenerateAllThumbnailsCommandHandler(
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

    public async Task<Result<RegenerateAllThumbnailsCommandResponse>> Handle(
        RegenerateAllThumbnailsCommand command,
        CancellationToken cancellationToken)
    {
        var models = await _modelRepository.GetAllAsync(cancellationToken);
        var now = _dateTimeProvider.UtcNow;

        var enqueued = 0;
        var skipped = 0;

        foreach (var model in models)
        {
            var targetVersion = model.ActiveVersion ?? model.Versions.FirstOrDefault();
            if (targetVersion == null)
            {
                skipped++;
                continue;
            }

            var primaryFile = targetVersion.Files.FirstOrDefault();
            if (primaryFile == null)
            {
                skipped++;
                continue;
            }

            // GetAllAsync returns detached entities (AsNoTracking), so the
            // Thumbnail navigation may be stale. Re-fetch via the repository
            // to make the create-vs-reset decision idempotent — important
            // because there's no unique constraint on Thumbnails.ModelVersionId
            // and concurrent bulk-regen invocations would otherwise produce
            // duplicate rows.
            var existingThumbnail = await _thumbnailRepository
                .GetByModelVersionIdAsync(targetVersion.Id, cancellationToken);

            if (existingThumbnail != null)
            {
                existingThumbnail.Reset(now);
                await _thumbnailRepository.UpdateAsync(existingThumbnail, cancellationToken);
            }
            else
            {
                var newThumbnail = Thumbnail.Create(model.Id, targetVersion.Id, now);
                await _thumbnailRepository.AddAsync(newThumbnail, cancellationToken);
            }

            await _thumbnailQueue.EnqueueAsync(
                model.Id,
                targetVersion.Id,
                primaryFile.Sha256Hash,
                forceRegenerate: true,
                cancellationToken: cancellationToken);

            enqueued++;
        }

        return Result.Success(new RegenerateAllThumbnailsCommandResponse(enqueued, skipped));
    }
}

public record RegenerateAllThumbnailsCommand : ICommand<RegenerateAllThumbnailsCommandResponse>;

public record RegenerateAllThumbnailsCommandResponse(int EnqueuedCount, int SkippedCount);
