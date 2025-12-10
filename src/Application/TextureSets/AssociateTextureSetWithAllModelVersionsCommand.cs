using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.TextureSets;

internal class AssociateTextureSetWithAllModelVersionsCommandHandler : ICommandHandler<AssociateTextureSetWithAllModelVersionsCommand>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IModelRepository _modelRepository;
    private readonly IModelVersionRepository _modelVersionRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public AssociateTextureSetWithAllModelVersionsCommandHandler(
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

            // Get all versions of the model
            var modelVersions = await _modelVersionRepository.GetByModelIdAsync(command.ModelId, cancellationToken);
            if (!modelVersions.Any())
            {
                return Result.Failure(
                    new Error("NoVersionsFound", $"No versions found for model '{model.Name}'."));
            }

            // Associate texture set with all versions
            var now = _dateTimeProvider.UtcNow;
            foreach (var version in modelVersions)
            {
                if (!textureSet.HasModelVersion(version.Id))
                {
                    textureSet.AddModelVersion(version, now);
                }
            }

            // Update the texture set
            await _textureSetRepository.UpdateAsync(textureSet, cancellationToken);

            return Result.Success();
        }
        catch (ArgumentException ex)
        {
            return Result.Failure(
                new Error("AssociateTextureSetWithAllModelVersionsFailed", ex.Message));
        }
    }
}

public record AssociateTextureSetWithAllModelVersionsCommand(int TextureSetId, int ModelId) : ICommand;
