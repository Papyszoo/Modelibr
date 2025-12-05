using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Projects;

internal class GetAllProjectsQueryHandler : IQueryHandler<GetAllProjectsQuery, GetAllProjectsResponse>
{
    private readonly IProjectRepository _projectRepository;

    public GetAllProjectsQueryHandler(IProjectRepository projectRepository)
    {
        _projectRepository = projectRepository;
    }

    public async Task<Result<GetAllProjectsResponse>> Handle(GetAllProjectsQuery query, CancellationToken cancellationToken)
    {
        var projects = await _projectRepository.GetAllAsync(cancellationToken);

        var projectDtos = projects.Select(p => new ProjectDto
        {
            Id = p.Id,
            Name = p.Name,
            Description = p.Description,
            CreatedAt = p.CreatedAt,
            UpdatedAt = p.UpdatedAt,
            ModelCount = p.ModelCount,
            TextureSetCount = p.TextureSetCount,
            SpriteCount = p.SpriteCount,
            IsEmpty = p.IsEmpty,
            Models = p.Models.Select(m => new ProjectModelDto
            {
                Id = m.Id,
                Name = m.Name
            }).ToList(),
            TextureSets = p.TextureSets.Select(ts => new ProjectTextureSetDto
            {
                Id = ts.Id,
                Name = ts.Name
            }).ToList(),
            Sprites = p.Sprites.Select(s => new ProjectSpriteDto
            {
                Id = s.Id,
                Name = s.Name
            }).ToList()
        }).ToList();

        return Result.Success(new GetAllProjectsResponse(projectDtos));
    }
}

public record GetAllProjectsQuery() : IQuery<GetAllProjectsResponse>;
public record GetAllProjectsResponse(IEnumerable<ProjectDto> Projects);

public record ProjectDto
{
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Description { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
    public int ModelCount { get; init; }
    public int TextureSetCount { get; init; }
    public int SpriteCount { get; init; }
    public bool IsEmpty { get; init; }
    public ICollection<ProjectModelDto> Models { get; init; } = new List<ProjectModelDto>();
    public ICollection<ProjectTextureSetDto> TextureSets { get; init; } = new List<ProjectTextureSetDto>();
    public ICollection<ProjectSpriteDto> Sprites { get; init; } = new List<ProjectSpriteDto>();
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
