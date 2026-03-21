using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Services;
using SharedKernel;

namespace Application.TextureSets;

internal class AssociateTextureSetWithModelVersionCommandHandler : ICommandHandler<AssociateTextureSetWithModelVersionCommand>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IThumbnailRepository _thumbnailRepository;
    private readonly IThumbnailQueue _thumbnailQueue;
    private readonly IDateTimeProvider _dateTimeProvider;

    public AssociateTextureSetWithModelVersionCommandHandler(
        ITextureSetRepository textureSetRepository,
        IModelVersionRepository modelVersionRepository,
        IThumbnailRepository thumbnailRepository,
        IThumbnailQueue thumbnailQueue,
        IDateTimeProvider dateTimeProvider)
    {
        _textureSetRepository = textureSetRepository;
        _modelVersionRepository = modelVersionRepository;
        _thumbnailRepository = thumbnailRepository;
        _thumbnailQueue = thumbnailQueue;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(AssociateTextureSetWithModelVersionCommand command, CancellationToken cancellationToken)
    {
        try
        {
            // Get the texture set
            var textureSet = await _textureSetRepository.GetByIdAsync(command.TextureSetId, cancellationToken);
            if (textureSet == null)
            {
                return Result.Failure(
                    new Error("TextureSetNotFound", $"Texture set with ID {command.TextureSetId} was not found."));
            }

            // Get the model version
            var modelVersion = await _modelVersionRepository.GetByIdAsync(command.ModelVersionId, cancellationToken);
            if (modelVersion == null)
            {
                return Result.Failure(
                    new Error("ModelVersionNotFound", $"Model version with ID {command.ModelVersionId} was not found."));
            }

            var materialName = command.MaterialName ?? string.Empty;
            var variantName = command.VariantName ?? string.Empty;

            // Check if this exact mapping already exists
            if (modelVersion.TextureMappings.Any(m => m.TextureSetId == command.TextureSetId && m.MaterialName == materialName && m.VariantName == variantName))
                return Result.Success();

            // For named materials within the same variant, remove existing mapping for that material+variant
            if (!string.IsNullOrEmpty(materialName))
            {
                await _modelVersionRepository.RemoveTextureMappingByMaterialAndVariantAsync(
                    modelVersion.Id, materialName, variantName, cancellationToken);
            }

            // Auto-register the variant name if it's new
            if (!string.IsNullOrEmpty(variantName))
            {
                var now = _dateTimeProvider.UtcNow;
                modelVersion.AddVariantName(variantName, now);
                await _modelVersionRepository.UpdateAsync(modelVersion, cancellationToken);
            }

            // Add the texture mapping directly via repository (avoids EF Core composite key tracking issues)
            await _modelVersionRepository.AddTextureMappingAsync(
                modelVersion.Id, command.TextureSetId, materialName, variantName, cancellationToken);

            // If the linked variant is the main variant, update DefaultTextureSetId and regenerate thumbnail.
            // After AddTextureMappingAsync + SaveChanges, EF Core relationship fixup adds the new mapping
            // to the tracked modelVersion entity, so SetDefaultTextureSet validation will pass.
            var mainVariant = modelVersion.MainVariantName ?? string.Empty;
            if (variantName == mainVariant)
            {
                var now = _dateTimeProvider.UtcNow;
                modelVersion.SetDefaultTextureSet(command.TextureSetId, now);
                await _modelVersionRepository.UpdateAsync(modelVersion, cancellationToken);

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
            }

            return Result.Success();
        }
        catch (ArgumentException ex)
        {
            return Result.Failure(
                new Error("AssociateTextureSetWithModelVersionFailed", ex.Message));
        }
    }
}

public record AssociateTextureSetWithModelVersionCommand(int TextureSetId, int ModelVersionId, string? MaterialName = null, string? VariantName = null) : ICommand;
