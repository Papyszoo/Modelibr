using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.TexturePacks;

internal class DeleteTexturePackCommandHandler : ICommandHandler<DeleteTexturePackCommand>
{
    private readonly ITexturePackRepository _texturePackRepository;

    public DeleteTexturePackCommandHandler(ITexturePackRepository texturePackRepository)
    {
        _texturePackRepository = texturePackRepository;
    }

    public async Task<Result> Handle(DeleteTexturePackCommand command, CancellationToken cancellationToken)
    {
        var texturePack = await _texturePackRepository.GetByIdAsync(command.Id, cancellationToken);
        if (texturePack == null)
        {
            return Result.Failure(
                new Error("TexturePackNotFound", $"Texture pack with ID {command.Id} was not found."));
        }

        await _texturePackRepository.DeleteAsync(command.Id, cancellationToken);

        return Result.Success();
    }
}

public record DeleteTexturePackCommand(int Id) : ICommand;