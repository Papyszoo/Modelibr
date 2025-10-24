using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using SharedKernel;

namespace Application.TextureSets;

internal class DeleteTextureSetCommandHandler : ICommandHandler<DeleteTextureSetCommand>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IFileRepository _fileRepository;
    private readonly IFileRecyclingService _fileRecyclingService;

    public DeleteTextureSetCommandHandler(
        ITextureSetRepository textureSetRepository,
        IFileRepository fileRepository,
        IFileRecyclingService fileRecyclingService)
    {
        _textureSetRepository = textureSetRepository;
        _fileRepository = fileRepository;
        _fileRecyclingService = fileRecyclingService;
    }

    public async Task<Result> Handle(DeleteTextureSetCommand command, CancellationToken cancellationToken)
    {
        var textureSet = await _textureSetRepository.GetByIdAsync(command.Id, cancellationToken);
        if (textureSet == null)
        {
            return Result.Failure(
                new Error("TextureSetNotFound", $"Texture set with ID {command.Id} was not found."));
        }

        // Recycle files associated with textures in this texture set
        foreach (var texture in textureSet.Textures)
        {
            var file = await _fileRepository.GetByIdAsync(texture.FileId, cancellationToken);
            if (file != null)
            {
                await _fileRecyclingService.RecycleFileAsync(
                    file,
                    $"Texture set '{textureSet.Name}' (ID: {textureSet.Id}) was deleted",
                    cancellationToken);
            }
        }

        await _textureSetRepository.DeleteAsync(command.Id, cancellationToken);

        return Result.Success();
    }
}

public record DeleteTextureSetCommand(int Id) : ICommand;