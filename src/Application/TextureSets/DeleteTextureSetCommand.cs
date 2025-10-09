using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.TextureSets;

internal class DeleteTextureSetCommandHandler : ICommandHandler<DeleteTextureSetCommand>
{
    private readonly ITextureSetRepository _textureSetRepository;

    public DeleteTextureSetCommandHandler(ITextureSetRepository textureSetRepository)
    {
        _textureSetRepository = textureSetRepository;
    }

    public async Task<Result> Handle(DeleteTextureSetCommand command, CancellationToken cancellationToken)
    {
        var textureSet = await _textureSetRepository.GetByIdAsync(command.Id, cancellationToken);
        if (textureSet == null)
        {
            return Result.Failure(
                new Error("TextureSetNotFound", $"Texture set with ID {command.Id} was not found."));
        }

        await _textureSetRepository.DeleteAsync(command.Id, cancellationToken);

        return Result.Success();
    }
}

public record DeleteTextureSetCommand(int Id) : ICommand;