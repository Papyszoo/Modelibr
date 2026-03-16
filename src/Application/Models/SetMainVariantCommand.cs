using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Services;
using SharedKernel;

namespace Application.Models;

public record SetMainVariantCommand(int ModelVersionId, string VariantName) : ICommand;

internal class SetMainVariantCommandHandler : ICommandHandler<SetMainVariantCommand>
{
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IThumbnailRepository _thumbnailRepository;
    private readonly IThumbnailQueue _thumbnailQueue;
    private readonly IDateTimeProvider _dateTimeProvider;

    public SetMainVariantCommandHandler(
        IModelVersionRepository modelVersionRepository,
        IThumbnailRepository thumbnailRepository,
        IThumbnailQueue thumbnailQueue,
        IDateTimeProvider dateTimeProvider)
    {
        _modelVersionRepository = modelVersionRepository;
        _thumbnailRepository = thumbnailRepository;
        _thumbnailQueue = thumbnailQueue;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(SetMainVariantCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var modelVersion = await _modelVersionRepository.GetByIdAsync(command.ModelVersionId, cancellationToken);
            if (modelVersion == null)
            {
                return Result.Failure(
                    new Error("ModelVersionNotFound", $"Model version with ID {command.ModelVersionId} was not found."));
            }

            var now = _dateTimeProvider.UtcNow;
            modelVersion.SetMainVariant(command.VariantName, now);

            // Update DefaultTextureSetId to the first texture set of the new main variant
            var mainVariantMapping = modelVersion.TextureMappings
                .FirstOrDefault(m => m.VariantName == (command.VariantName ?? string.Empty));
            var newDefaultTextureSetId = mainVariantMapping?.TextureSetId;
            modelVersion.SetDefaultTextureSet(newDefaultTextureSetId, now);

            await _modelVersionRepository.UpdateAsync(modelVersion, cancellationToken);

            // Enqueue thumbnail regeneration with the new main variant's textures
            var primaryFile = modelVersion.Files.FirstOrDefault();
            if (primaryFile != null)
            {
                if (modelVersion.Thumbnail != null)
                {
                    modelVersion.Thumbnail.Reset(now);
                    await _thumbnailRepository.UpdateAsync(modelVersion.Thumbnail, cancellationToken);
                }

                await _thumbnailQueue.EnqueueAsync(
                    modelVersion.ModelId,
                    modelVersion.Id,
                    primaryFile.Sha256Hash,
                    cancellationToken: cancellationToken);
            }

            return Result.Success();
        }
        catch (InvalidOperationException ex)
        {
            return Result.Failure(
                new Error("InvalidVariant", ex.Message));
        }
    }
}
