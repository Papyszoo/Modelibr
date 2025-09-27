using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.TexturePacks;

internal class DisassociateTexturePackFromModelCommandHandler : ICommandHandler<DisassociateTexturePackFromModelCommand>
{
    private readonly ITexturePackRepository _texturePackRepository;
    private readonly IModelRepository _modelRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public DisassociateTexturePackFromModelCommandHandler(
        ITexturePackRepository texturePackRepository,
        IModelRepository modelRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _texturePackRepository = texturePackRepository;
        _modelRepository = modelRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result> Handle(DisassociateTexturePackFromModelCommand command, CancellationToken cancellationToken)
    {
        try
        {
            // Get the texture pack
            var texturePack = await _texturePackRepository.GetByIdAsync(command.TexturePackId, cancellationToken);
            if (texturePack == null)
            {
                return Result.Failure(
                    new Error("TexturePackNotFound", $"Texture pack with ID {command.TexturePackId} was not found."));
            }

            // Get the model
            var model = await _modelRepository.GetByIdAsync(command.ModelId, cancellationToken);
            if (model == null)
            {
                return Result.Failure(
                    new Error("ModelNotFound", $"Model with ID {command.ModelId} was not found."));
            }

            // Check if association exists
            if (!texturePack.HasModel(command.ModelId))
            {
                return Result.Failure(
                    new Error("AssociationNotFound", $"Texture pack '{texturePack.Name}' is not associated with model '{model.Name}'."));
            }

            // Remove the model association
            texturePack.RemoveModel(model, _dateTimeProvider.UtcNow);

            // Update the texture pack
            await _texturePackRepository.UpdateAsync(texturePack, cancellationToken);

            return Result.Success();
        }
        catch (ArgumentException ex)
        {
            return Result.Failure(
                new Error("DisassociateTexturePackFromModelFailed", ex.Message));
        }
    }
}

public record DisassociateTexturePackFromModelCommand(int TexturePackId, int ModelId) : ICommand;