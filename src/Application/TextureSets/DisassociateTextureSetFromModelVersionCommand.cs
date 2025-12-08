using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.TextureSets;

internal class DisassociateTextureSetFromModelVersionCommandHandler : ICommandHandler<DisassociateTextureSetFromModelVersionCommand>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public DisassociateTextureSetFromModelVersionCommandHandler(
        ITextureSetRepository textureSetRepository,
        IModelVersionRepository modelVersionRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _textureSetRepository = textureSetRepository;
        _modelVersionRepository = modelVersionRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(DisassociateTextureSetFromModelVersionCommand command, CancellationToken cancellationToken)
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

            // Check if association exists
            if (!textureSet.HasModelVersion(command.ModelVersionId))
            {
                return Result.Failure(
                    new Error("AssociationNotFound", $"Texture set '{textureSet.Name}' is not associated with model version {modelVersion.VersionNumber}."));
            }

            // Remove the model version association
            textureSet.RemoveModelVersion(modelVersion, _dateTimeProvider.UtcNow);

            // Update the texture set
            await _textureSetRepository.UpdateAsync(textureSet, cancellationToken);

            return Result.Success();
        }
        catch (ArgumentException ex)
        {
            return Result.Failure(
                new Error("DisassociateTextureSetFromModelVersionFailed", ex.Message));
        }
    }
}

public record DisassociateTextureSetFromModelVersionCommand(int TextureSetId, int ModelVersionId) : ICommand;
