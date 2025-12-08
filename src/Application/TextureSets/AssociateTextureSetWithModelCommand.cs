using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.TextureSets;

internal class AssociateTextureSetWithModelCommandHandler : ICommandHandler<AssociateTextureSetWithModelCommand>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IModelRepository _modelRepository;
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public AssociateTextureSetWithModelCommandHandler(
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

    public async Task<Result> Handle(AssociateTextureSetWithModelCommand command, CancellationToken cancellationToken)
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

                // Check if already associated
                if (textureSet.HasModelVersion(command.ModelVersionId.Value))
                {
                    return Result.Failure(
                        new Error("AssociationAlreadyExists", $"Texture set '{textureSet.Name}' is already associated with model version {modelVersion.VersionNumber}."));
                }

                // Associate the model version with the texture set
                textureSet.AddModelVersion(modelVersion, _dateTimeProvider.UtcNow);
            }
            else
            {
                // Fallback: Use ModelId and associate with active version for backward compatibility
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

                // Check if already associated
                if (textureSet.HasModelVersion(activeVersion.Id))
                {
                    return Result.Failure(
                        new Error("AssociationAlreadyExists", $"Texture set '{textureSet.Name}' is already associated with the active version of model '{model.Name}'."));
                }

                // Associate the active version with the texture set
                textureSet.AddModelVersion(activeVersion, _dateTimeProvider.UtcNow);
            }

            // Update the texture set
            await _textureSetRepository.UpdateAsync(textureSet, cancellationToken);

            return Result.Success();
        }
        catch (ArgumentException ex)
        {
            return Result.Failure(
                new Error("AssociateTextureSetWithModelFailed", ex.Message));
        }
    }
}

public record AssociateTextureSetWithModelCommand(int TextureSetId, int ModelId, int? ModelVersionId = null) : ICommand;