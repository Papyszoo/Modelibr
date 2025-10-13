using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using SharedKernel;

namespace Application.TextureSets;

internal class GetTextureSetByFileIdQueryHandler : IQueryHandler<GetTextureSetByFileIdQuery, GetTextureSetByFileIdResponse>
{
    private readonly IFileRepository _fileRepository;
    private readonly ITextureSetRepository _textureSetRepository;

    public GetTextureSetByFileIdQueryHandler(
        IFileRepository fileRepository,
        ITextureSetRepository textureSetRepository)
    {
        _fileRepository = fileRepository;
        _textureSetRepository = textureSetRepository;
    }

    public async Task<Result<GetTextureSetByFileIdResponse>> Handle(GetTextureSetByFileIdQuery query, CancellationToken cancellationToken)
    {
        // Get the file to get its hash
        var file = await _fileRepository.GetByIdAsync(query.FileId, cancellationToken);
        if (file == null)
        {
            return Result.Failure<GetTextureSetByFileIdResponse>(
                new Error("FileNotFound", $"File with ID {query.FileId} was not found."));
        }

        // Find texture set containing this file
        var textureSet = await _textureSetRepository.GetByFileHashAsync(file.Sha256Hash, cancellationToken);
        
        if (textureSet == null)
        {
            return Result.Success(new GetTextureSetByFileIdResponse(null));
        }

        return Result.Success(new GetTextureSetByFileIdResponse(textureSet.Id));
    }
}

public record GetTextureSetByFileIdQuery(int FileId) : IQuery<GetTextureSetByFileIdResponse>;

public record GetTextureSetByFileIdResponse(int? TextureSetId);
