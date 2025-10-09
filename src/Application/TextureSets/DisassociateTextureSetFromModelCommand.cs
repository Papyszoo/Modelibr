using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.TextureSets;

internal class DisassociateTextureSetFromModelCommandHandler : ICommandHandler<DisassociateTextureSetFromModelCommand>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IModelRepository _modelRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public DisassociateTextureSetFromModelCommandHandler(
        ITextureSetRepository textureSetRepository,
        IModelRepository modelRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _textureSetRepository = textureSetRepository;
        _modelRepository = modelRepository;
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

            // Get the model
            var model = await _modelRepository.GetByIdAsync(command.ModelId, cancellationToken);
            if (model == null)
            {
                return Result.Failure(
                    new Error("ModelNotFound", $"Model with ID {command.ModelId} was not found."));
            }

            // Check if association exists
            if (!textureSet.HasModel(command.ModelId))
            {
                return Result.Failure(
                    new Error("AssociationNotFound", $"Texture set '{textureSet.Name}' is not associated with model '{model.Name}'."));
            }

            // Remove the model association
            textureSet.RemoveModel(model, _dateTimeProvider.UtcNow);

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

public record DisassociateTextureSetFromModelCommand(int TextureSetId, int ModelId) : ICommand;