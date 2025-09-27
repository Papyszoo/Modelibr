using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.TexturePacks;

internal class GetTexturePackByIdQueryHandler : IQueryHandler<GetTexturePackByIdQuery, GetTexturePackByIdResponse>
{
    private readonly ITexturePackRepository _texturePackRepository;

    public GetTexturePackByIdQueryHandler(ITexturePackRepository texturePackRepository)
    {
        _texturePackRepository = texturePackRepository;
    }

    public async Task<Result<GetTexturePackByIdResponse>> Handle(GetTexturePackByIdQuery query, CancellationToken cancellationToken)
    {
        var texturePack = await _texturePackRepository.GetByIdAsync(query.Id, cancellationToken);
        
        if (texturePack == null)
        {
            return Result.Failure<GetTexturePackByIdResponse>(
                new Error("TexturePackNotFound", $"Texture pack with ID {query.Id} was not found."));
        }

        var texturePackDto = new TexturePackDto
        {
            Id = texturePack.Id,
            Name = texturePack.Name,
            CreatedAt = texturePack.CreatedAt,
            UpdatedAt = texturePack.UpdatedAt,
            TextureCount = texturePack.TextureCount,
            IsEmpty = texturePack.IsEmpty,
            Textures = texturePack.Textures.Select(t => new TextureDto
            {
                Id = t.Id,
                TextureType = t.TextureType,
                FileId = t.FileId,
                FileName = t.File?.OriginalFileName,
                CreatedAt = t.CreatedAt
            }).ToList(),
            AssociatedModels = texturePack.Models.Select(m => new ModelSummaryDto
            {
                Id = m.Id,
                Name = m.Name
            }).ToList()
        };

        return Result.Success(new GetTexturePackByIdResponse(texturePackDto));
    }
}

public record GetTexturePackByIdQuery(int Id) : IQuery<GetTexturePackByIdResponse>;
public record GetTexturePackByIdResponse(TexturePackDto TexturePack);