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
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IThumbnailRepository _thumbnailRepository;
    private readonly IThumbnailQueue _thumbnailQueue;
    private readonly IDateTimeProvider _dateTimeProvider;

    public RegenerateAllThumbnailsCommandHandler(
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
            // Thumbnail navigation may be stale. Re-fetch by ModelVersionId
            // to make the create-vs-reset decision idempotent — there IS a
            // unique constraint on Thumbnails.ModelVersionId, and a bare
            // AddAsync would 500 on the second invocation.
            var existingThumbnail = await _thumbnailRepository
                .GetByModelVersionIdAsync(targetVersion.Id, cancellationToken);

            Thumbnail thumbnailRow;
            if (existingThumbnail != null)
            {
                existingThumbnail.Reset(now);
                await _thumbnailRepository.UpdateAsync(existingThumbnail, cancellationToken);
                thumbnailRow = existingThumbnail;
            }
            else
            {
                var newThumbnail = Thumbnail.Create(model.Id, targetVersion.Id, now);
                thumbnailRow = await _thumbnailRepository.AddAsync(newThumbnail, cancellationToken);
            }

            // The Thumbnails table's FK is ModelVersion.ThumbnailId — without
            // updating it, the subsequent worker upload (UploadThumbnailCommand)
            // would see ThumbnailId == null and try to AddAsync a fresh row,
            // hitting IX_Thumbnails_ModelVersionId. Use a targeted SQL update
            // because IModelRepository.UpdateAsync attaches the whole graph
            // (Packs/Projects/etc.) and conflicts across loop iterations.
            if (targetVersion.ThumbnailId != thumbnailRow.Id)
            {
                await _modelVersionRepository.SetThumbnailIdAsync(
                    targetVersion.Id,
                    thumbnailRow.Id,
                    cancellationToken);
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
