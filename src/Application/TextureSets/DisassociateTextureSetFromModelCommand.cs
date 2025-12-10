using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.TextureSets;

internal class DisassociateTextureSetFromModelCommandHandler : ICommandHandler<DisassociateTextureSetFromModelCommand>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IModelRepository _modelRepository;
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public DisassociateTextureSetFromModelCommandHandler(
        ITextureSetRepository textureSetRepository,
        IModelRepository modelRepository,
        IModelVersionRepository modelVersionRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _textureSetRepository = textureSetRepository;
        _modelRepository = modelRepository;
        _modelVersionRepository = modelVersionRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(DisassociateTextureSetFromModelCommand command, CancellationToken cancellationToken)
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

            // If ModelVersionId is specified, use it directly
            if (command.ModelVersionId.HasValue)
            {
                var modelVersion = await _modelVersionRepository.GetByIdAsync(command.ModelVersionId.Value, cancellationToken);
                if (modelVersion == null)
                {
                    return Result.Failure(
                        new Error("ModelVersionNotFound", $"Model version with ID {command.ModelVersionId.Value} was not found."));
                }

                // Check if association exists
                if (!textureSet.HasModelVersion(command.ModelVersionId.Value))
                {
                    return Result.Failure(
                        new Error("AssociationNotFound", $"Texture set '{textureSet.Name}' is not associated with model version {modelVersion.VersionNumber}."));
                }

                // Remove the model version association
                textureSet.RemoveModelVersion(modelVersion, _dateTimeProvider.UtcNow);
            }
            else
            {
                // Fallback: Use ModelId and disassociate from active version for backward compatibility
                var model = await _modelRepository.GetByIdAsync(command.ModelId, cancellationToken);
                if (model == null)
                {
                    return Result.Failure(
                        new Error("ModelNotFound", $"Model with ID {command.ModelId} was not found."));
                }

                if (model.ActiveVersionId == null)
                {
                    return Result.Failure(
                        new Error("NoActiveVersion", $"Model '{model.Name}' has no active version."));
                }

                var activeVersion = model.ActiveVersion;
                if (activeVersion == null)
                {
                    return Result.Failure(
                        new Error("ActiveVersionNotLoaded", $"Active version for model '{model.Name}' could not be loaded."));
                }

                // Check if association exists
                if (!textureSet.HasModelVersion(activeVersion.Id))
                {
                    return Result.Failure(
                        new Error("AssociationNotFound", $"Texture set '{textureSet.Name}' is not associated with the active version of model '{model.Name}'."));
                }

                // Remove the active version association
                textureSet.RemoveModelVersion(activeVersion, _dateTimeProvider.UtcNow);
            }

            // Update the texture set
            await _textureSetRepository.UpdateAsync(textureSet, cancellationToken);

            return Result.Success();
        }
        catch (ArgumentException ex)
        {
            return Result.Failure(
                new Error("DisassociateTextureSetFromModelFailed", ex.Message));
        }
    }
}

public record DisassociateTextureSetFromModelCommand(int TextureSetId, int ModelId, int? ModelVersionId = null) : ICommand;