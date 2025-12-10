using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.ValueObjects;
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

        var textureSetDetailDto = new TextureSetDetailDto
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

        return Result.Success(new GetTextureSetByIdResponse(textureSetDetailDto));
    }
}

public record GetTextureSetByIdQuery(int Id) : IQuery<GetTextureSetByIdResponse>;
public record GetTextureSetByIdResponse(TextureSetDetailDto TextureSet);

/// <summary>
/// Detailed DTO for single texture set - contains all related information including textures, models, packs, and projects
/// </summary>
public record TextureSetDetailDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
    public int TextureCount { get; init; }
    public bool IsEmpty { get; init; }
    public ICollection<TextureDto> Textures { get; init; } = new List<TextureDto>();
    public ICollection<ModelSummaryDto> AssociatedModels { get; init; } = new List<ModelSummaryDto>();
    public ICollection<PackSummaryDto> Packs { get; init; } = new List<PackSummaryDto>();
    public ICollection<ProjectSummaryDto> Projects { get; init; } = new List<ProjectSummaryDto>();
}

public record TextureDto
{
    public int Id { get; init; }
    public required TextureType TextureType { get; init; }
    public int FileId { get; init; }
    public string? FileName { get; init; }
    public DateTime CreatedAt { get; init; }
}

public record ModelSummaryDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public int? VersionNumber { get; init; }
    public int ModelVersionId { get; init; }
}

public record PackSummaryDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
}

public record ProjectSummaryDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
}