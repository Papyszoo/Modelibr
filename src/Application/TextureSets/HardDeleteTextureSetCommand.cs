using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.TextureSets;

/// <summary>
/// Hard deletes a texture set from the database without deleting associated files.
/// This is used for merge operations where the texture's file is being kept in another set.
/// </summary>
public record HardDeleteTextureSetCommand(int TextureSetId) : ICommand<HardDeleteTextureSetResponse>;

public record HardDeleteTextureSetResponse(bool Success, string Message);

internal sealed class HardDeleteTextureSetCommandHandler : ICommandHandler<HardDeleteTextureSetCommand, HardDeleteTextureSetResponse>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IStoreImportedItemRepository _storeImportedItemRepository;
    private readonly IUnitOfWork _unitOfWork;

    public HardDeleteTextureSetCommandHandler(
        ITextureSetRepository textureSetRepository,
        IStoreImportedItemRepository storeImportedItemRepository,
        IUnitOfWork unitOfWork)
    {
        _textureSetRepository = textureSetRepository;
        _storeImportedItemRepository = storeImportedItemRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<HardDeleteTextureSetResponse>> Handle(HardDeleteTextureSetCommand request, CancellationToken cancellationToken)
    {
        var textureSet = await _textureSetRepository.GetByIdAsync(request.TextureSetId, cancellationToken);
        
        if (textureSet == null)
        {
            return Result.Failure<HardDeleteTextureSetResponse>(
                new Error("TextureSetNotFound", $"Texture set with ID {request.TextureSetId} not found."));
        }

        // Hard delete - removes the texture set and its textures from database
        // but does NOT delete the actual file from storage since it's being used elsewhere
        await _storeImportedItemRepository.DeleteByAssetAsync("TextureSet", request.TextureSetId, cancellationToken);
        await _textureSetRepository.HardDeleteAsync(request.TextureSetId, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(new HardDeleteTextureSetResponse(true, "Texture set deleted successfully"));
    }
}
