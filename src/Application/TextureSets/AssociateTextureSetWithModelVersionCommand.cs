using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.TextureSets;

internal class AssociateTextureSetWithModelVersionCommandHandler : ICommandHandler<AssociateTextureSetWithModelVersionCommand>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public AssociateTextureSetWithModelVersionCommandHandler(
        ITextureSetRepository textureSetRepository,
        IModelVersionRepository modelVersionRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _textureSetRepository = textureSetRepository;
        _modelVersionRepository = modelVersionRepository;
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

            // Check if already associated
            if (textureSet.HasModelVersion(command.ModelVersionId))
            {
                return Result.Failure(
                    new Error("AssociationAlreadyExists", $"Texture set '{textureSet.Name}' is already associated with model version {modelVersion.VersionNumber}."));
            }

            // Associate the model version with the texture set
            textureSet.AddModelVersion(modelVersion, _dateTimeProvider.UtcNow);

            // Update the texture set
            await _textureSetRepository.UpdateAsync(textureSet, cancellationToken);

            return Result.Success();
        }
        catch (ArgumentException ex)
        {
            return Result.Failure(
                new Error("AssociateTextureSetWithModelVersionFailed", ex.Message));
        }
    }
}

public record AssociateTextureSetWithModelVersionCommand(int TextureSetId, int ModelVersionId) : ICommand;
