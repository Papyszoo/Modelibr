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

        var projectListDtos = projects.Select(p => new ProjectListDto
        {
            Id = p.Id,
            Name = p.Name,
            Description = p.Description,
            CreatedAt = p.CreatedAt,
            UpdatedAt = p.UpdatedAt,
            ModelCount = p.ModelCount,
            TextureSetCount = p.TextureSetCount,
            SpriteCount = p.SpriteCount,
            IsEmpty = p.IsEmpty
        }).ToList();

        return Result.Success(new GetAllProjectsResponse(projectListDtos));
    }
}

public record GetAllProjectsQuery() : IQuery<GetAllProjectsResponse>;
public record GetAllProjectsResponse(IEnumerable<ProjectListDto> Projects);

/// <summary>
/// Minimal DTO for project list - contains only basic information and counts needed for list views
/// </summary>
public record ProjectListDto
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
}
