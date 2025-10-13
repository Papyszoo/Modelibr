using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.TextureSets;

internal class GetTextureSetByFileHashQueryHandler : IQueryHandler<GetTextureSetByFileHashQuery, GetTextureSetByFileHashResponse>
{
    private readonly ITextureSetRepository _textureSetRepository;

    public GetTextureSetByFileHashQueryHandler(ITextureSetRepository textureSetRepository)
    {
        _textureSetRepository = textureSetRepository;
    }

    public async Task<Result<GetTextureSetByFileHashResponse>> Handle(GetTextureSetByFileHashQuery query, CancellationToken cancellationToken)
    {
        var textureSet = await _textureSetRepository.GetByFileHashAsync(query.FileHash, cancellationToken);
        
        if (textureSet == null)
        {
            return Result.Success(new GetTextureSetByFileHashResponse(null));
        }

        return Result.Success(new GetTextureSetByFileHashResponse(textureSet.Id));
    }
}

public record GetTextureSetByFileHashQuery(string FileHash) : IQuery<GetTextureSetByFileHashResponse>;

public record GetTextureSetByFileHashResponse(int? TextureSetId);
