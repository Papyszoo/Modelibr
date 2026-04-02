using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using Domain.Services;
using SharedKernel;

namespace Application.TextureSets;

internal class DisassociateTextureSetFromModelVersionCommandHandler : ICommandHandler<DisassociateTextureSetFromModelVersionCommand>
{
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IBlendFileGenerator _blendFileGenerator;

    public DisassociateTextureSetFromModelVersionCommandHandler(
        IModelVersionRepository modelVersionRepository,
        IDateTimeProvider dateTimeProvider,
        IBlendFileGenerator blendFileGenerator)
    {
        _modelVersionRepository = modelVersionRepository;
        _dateTimeProvider = dateTimeProvider;
        _blendFileGenerator = blendFileGenerator;
    }

    public async Task<Result> Handle(DisassociateTextureSetFromModelVersionCommand command, CancellationToken cancellationToken)
    {
        try
        {
            // Get the model version
            var modelVersion = await _modelVersionRepository.GetByIdAsync(command.ModelVersionId, cancellationToken);
            if (modelVersion == null)
            {
                return Result.Failure(
                    new Error("ModelVersionNotFound", $"Model version with ID {command.ModelVersionId} was not found."));
            }

            // When MaterialName is not specified, remove ALL mappings for this texture set
            if (command.MaterialName == null)
            {
                await _modelVersionRepository.RemoveTextureMappingsByTextureSetIdAsync(
                    modelVersion.Id, command.TextureSetId, cancellationToken);
            }
            else
            {
                var materialName = command.MaterialName ?? string.Empty;
                var variantName = command.VariantName ?? string.Empty;
                await _modelVersionRepository.RemoveTextureMappingAsync(
                    modelVersion.Id, command.TextureSetId, materialName, variantName, cancellationToken);
            }

            // Invalidate cached .blend so it regenerates without removed textures
            _blendFileGenerator.InvalidateCache(modelVersion.ModelId, modelVersion.Id);

            return Result.Success();
        }
        catch (ArgumentException ex)
        {
            return Result.Failure(
                new Error("DisassociateTextureSetFromModelVersionFailed", ex.Message));
        }
    }
}

public record DisassociateTextureSetFromModelVersionCommand(int TextureSetId, int ModelVersionId, string? MaterialName = null, string? VariantName = null) : ICommand;
