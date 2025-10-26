using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.TextureSets;

public record SoftDeleteTextureSetCommand(int TextureSetId) : ICommand<SoftDeleteTextureSetResponse>;

public record SoftDeleteTextureSetResponse(bool Success, string Message);

internal sealed class SoftDeleteTextureSetCommandHandler : ICommandHandler<SoftDeleteTextureSetCommand, SoftDeleteTextureSetResponse>
{
    private readonly ITextureSetRepository _textureSetRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public SoftDeleteTextureSetCommandHandler(
        ITextureSetRepository textureSetRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _textureSetRepository = textureSetRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<SoftDeleteTextureSetResponse>> Handle(SoftDeleteTextureSetCommand request, CancellationToken cancellationToken)
    {
        var textureSet = await _textureSetRepository.GetByIdAsync(request.TextureSetId, cancellationToken);
        
        if (textureSet == null)
        {
            return Result.Failure<SoftDeleteTextureSetResponse>(new Error("TextureSetNotFound", $"Texture set with ID {request.TextureSetId} not found."));
        }

        textureSet.SoftDelete(_dateTimeProvider.UtcNow);
        await _textureSetRepository.UpdateAsync(textureSet, cancellationToken);

        return Result.Success(new SoftDeleteTextureSetResponse(true, "Texture set soft deleted successfully"));
    }
}
