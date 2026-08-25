using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Sprites;

internal class DeleteSpriteCommandHandler : ICommandHandler<DeleteSpriteCommand>
{
    private readonly ISpriteRepository _spriteRepository;
    private readonly IStoreImportedItemRepository _storeImportedItemRepository;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteSpriteCommandHandler(
        ISpriteRepository spriteRepository,
        IStoreImportedItemRepository storeImportedItemRepository,
        IUnitOfWork unitOfWork)
    {
        _spriteRepository = spriteRepository;
        _storeImportedItemRepository = storeImportedItemRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(DeleteSpriteCommand command, CancellationToken cancellationToken)
    {
        var sprite = await _spriteRepository.GetByIdAsync(command.Id, cancellationToken);
        if (sprite == null)
        {
            return Result.Failure(
                new Error("SpriteNotFound", $"Sprite with ID {command.Id} not found."));
        }

        await _storeImportedItemRepository.DeleteByAssetAsync("Sprite", command.Id, cancellationToken);
        await _spriteRepository.DeleteAsync(command.Id, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success();
    }
}

public record DeleteSpriteCommand(int Id) : ICommand;
