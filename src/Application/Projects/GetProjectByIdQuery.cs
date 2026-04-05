using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Projects;

internal class GetProjectByIdQueryHandler : IQueryHandler<GetProjectByIdQuery, ProjectDetailDto>
{
    private readonly IProjectRepository _projectRepository;

    public GetProjectByIdQueryHandler(IProjectRepository projectRepository)
    {
        _projectRepository = projectRepository;
    }

    public async Task<Result<ProjectDetailDto>> Handle(GetProjectByIdQuery query, CancellationToken cancellationToken)
    {
        var project = await _projectRepository.GetByIdAsync(query.Id, cancellationToken);

        if (project == null)
        {
            return Result.Failure<ProjectDetailDto>(
                new Error("ProjectNotFound", $"Project with ID {query.Id} was not found."));
        }

        var projectDetailDto = new ProjectDetailDto
        {
            Id = project.Id,
            Name = project.Name,
            Description = project.Description,
            Notes = project.Notes,
            CreatedAt = project.CreatedAt,
            UpdatedAt = project.UpdatedAt,
            ModelCount = project.ModelCount,
            TextureSetCount = project.TextureSetCount,
            SpriteCount = project.SpriteCount,
            SoundCount = project.SoundCount,
            IsEmpty = project.IsEmpty,
            CustomThumbnailUrl = project.CustomThumbnailFileId.HasValue ? $"/files/{project.CustomThumbnailFileId.Value}/preview?channel=rgb" : null,
            ConceptImages = project.ConceptImages
                .OrderBy(ci => ci.SortOrder)
                .Select(ci => new ProjectConceptImageDto
                {
                    FileId = ci.FileId,
                    FileName = ci.File.OriginalFileName,
                    PreviewUrl = $"/files/{ci.FileId}/preview?channel=rgb",
                    FileUrl = $"/files/{ci.FileId}",
                    SortOrder = ci.SortOrder
                }).ToList(),
            Models = project.Models.Select(m => new ProjectModelDto
            {
                Id = m.Id,
                Name = m.Name
            }).ToList(),
            TextureSets = project.TextureSets.Select(ts => new ProjectTextureSetDto
            {
                Id = ts.Id,
                Name = ts.Name
            }).ToList(),
            Sprites = project.Sprites.Select(s => new ProjectSpriteDto
            {
                Id = s.Id,
                Name = s.Name
            }).ToList()
        };

        return Result.Success(projectDetailDto);
    }
}

public record GetProjectByIdQuery(int Id) : IQuery<ProjectDetailDto>;

/// <summary>
/// Detailed DTO for single project - contains all related models, texture sets, and sprites
/// </summary>
public record ProjectDetailDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Description { get; init; }
    public string? Notes { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
    public int ModelCount { get; init; }
    public int TextureSetCount { get; init; }
    public int SpriteCount { get; init; }
    public int SoundCount { get; init; }
    public bool IsEmpty { get; init; }
    public string? CustomThumbnailUrl { get; init; }
    public ICollection<ProjectConceptImageDto> ConceptImages { get; init; } = new List<ProjectConceptImageDto>();
    public ICollection<ProjectModelDto> Models { get; init; } = new List<ProjectModelDto>();
    public ICollection<ProjectTextureSetDto> TextureSets { get; init; } = new List<ProjectTextureSetDto>();
    public ICollection<ProjectSpriteDto> Sprites { get; init; } = new List<ProjectSpriteDto>();
}

public record ProjectConceptImageDto
{
    public int FileId { get; init; }
    public string FileName { get; init; } = string.Empty;
    public string PreviewUrl { get; init; } = string.Empty;
    public string FileUrl { get; init; } = string.Empty;
    public int SortOrder { get; init; }
}

public record ProjectModelDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
}

public record ProjectTextureSetDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
}

public record ProjectSpriteDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
}
