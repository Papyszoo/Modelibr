using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.TextureSets;

internal class GetTextureSetByIdQueryHandler : IQueryHandler<GetTextureSetByIdQuery, GetTextureSetByIdResponse>
{
    private readonly ITextureSetRepository _textureSetRepository;

    public GetTextureSetByIdQueryHandler(ITextureSetRepository textureSetRepository)
    {
        _textureSetRepository = textureSetRepository;
    }

    public async Task<Result<GetTextureSetByIdResponse>> Handle(GetTextureSetByIdQuery query, CancellationToken cancellationToken)
    {
        var textureSet = await _textureSetRepository.GetByIdAsync(query.Id, cancellationToken);
        
        if (textureSet == null)
        {
            return Result.Failure<GetTextureSetByIdResponse>(
                new Error("TextureSetNotFound", $"Texture set with ID {query.Id} was not found."));
        }

        var textureSetDto = new TextureSetDto
        {
            Id = textureSet.Id,
            Name = textureSet.Name,
            CreatedAt = textureSet.CreatedAt,
            UpdatedAt = textureSet.UpdatedAt,
            TextureCount = textureSet.TextureCount,
            IsEmpty = textureSet.IsEmpty,
            Textures = textureSet.Textures.Select(t => new TextureDto
            {
                Id = t.Id,
                TextureType = t.TextureType,
                FileId = t.FileId,
                FileName = t.File?.OriginalFileName,
                CreatedAt = t.CreatedAt
            }).ToList(),
            AssociatedModels = textureSet.ModelVersions.Select(mv => new ModelSummaryDto
            {
                Id = mv.Model.Id,
                Name = mv.Model.Name,
                VersionNumber = mv.VersionNumber,
                ModelVersionId = mv.Id
            }).ToList(),
            Packs = textureSet.Packs.Select(p => new PackSummaryDto
            {
                Id = p.Id,
                Name = p.Name
            }).ToList(),
            Projects = textureSet.Projects.Select(p => new ProjectSummaryDto
            {
                Id = p.Id,
                Name = p.Name
            }).ToList()
        };

        return Result.Success(new GetTextureSetByIdResponse(textureSetDto));
    }
}

public record GetTextureSetByIdQuery(int Id) : IQuery<GetTextureSetByIdResponse>;
public record GetTextureSetByIdResponse(TextureSetDto TextureSet);