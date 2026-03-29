using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Services;
using SharedKernel;

namespace Application.TextureSets;

internal class AssociateTextureSetWithAllModelVersionsCommandHandler : ICommandHandler<AssociateTextureSetWithAllModelVersionsCommand>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IModelRepository _modelRepository;
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IBlendFileGenerator _blendFileGenerator;

    public AssociateTextureSetWithAllModelVersionsCommandHandler(
        ITextureSetRepository textureSetRepository,
        IModelRepository modelRepository,
        IModelVersionRepository modelVersionRepository,
        IDateTimeProvider dateTimeProvider,
        IBlendFileGenerator blendFileGenerator)
    {
        _textureSetRepository = textureSetRepository;
        _modelRepository = modelRepository;
        _modelVersionRepository = modelVersionRepository;
        _dateTimeProvider = dateTimeProvider;
        _blendFileGenerator = blendFileGenerator;
    }

    public async Task<Result> Handle(AssociateTextureSetWithAllModelVersionsCommand command, CancellationToken cancellationToken)
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

            // Get the model to verify it exists
            var model = await _modelRepository.GetByIdAsync(command.ModelId, cancellationToken);
            if (model == null)
            {
                return Result.Failure(
                    new Error("ModelNotFound", $"Model with ID {command.ModelId} was not found."));
            }

            // Get all versions of the model (AsNoTracking, for ID/mapping info only)
            var modelVersions = await _modelVersionRepository.GetByModelIdAsync(command.ModelId, cancellationToken);
            if (!modelVersions.Any())
            {
                return Result.Failure(
                    new Error("NoVersionsFound", $"No versions found for model '{model.Name}'."));
            }

            var materialName = command.MaterialName ?? string.Empty;

            // Associate texture set with all versions directly via repository
            foreach (var version in modelVersions)
            {
                // Skip if already mapped
                if (version.TextureMappings.Any(m => m.TextureSetId == command.TextureSetId && m.MaterialName == materialName))
                    continue;

                // For named materials, remove existing mapping for that material name
                if (!string.IsNullOrEmpty(materialName))
                {
                    await _modelVersionRepository.RemoveTextureMappingByMaterialAsync(
                        version.Id, materialName, cancellationToken);
                }

                await _modelVersionRepository.AddTextureMappingAsync(
                    version.Id, command.TextureSetId, materialName, cancellationToken);

                // Invalidate cached .blend so it regenerates with new textures
                _blendFileGenerator.InvalidateCache(command.ModelId, version.Id);
            }

            return Result.Success();
        }
        catch (ArgumentException ex)
        {
            return Result.Failure(
                new Error("AssociateTextureSetWithAllModelVersionsFailed", ex.Message));
        }
    }
}

public record AssociateTextureSetWithAllModelVersionsCommand(int TextureSetId, int ModelId, string? MaterialName = null) : ICommand;
