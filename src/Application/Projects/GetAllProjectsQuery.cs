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
            Notes = p.Notes,
            CreatedAt = p.CreatedAt,
            UpdatedAt = p.UpdatedAt,
            ModelCount = p.ModelCount,
            TextureSetCount = p.TextureSetCount,
            SpriteCount = p.SpriteCount,
            SoundCount = p.SoundCount,
            EnvironmentMapCount = p.EnvironmentMapCount,
            IsEmpty = p.IsEmpty
            ,CustomThumbnailUrl = p.CustomThumbnailFileId.HasValue ? $"/files/{p.CustomThumbnailFileId.Value}/preview?channel=rgb" : null
            ,ConceptImageCount = p.ConceptImages.Count
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
    public string? Notes { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
    public int ModelCount { get; init; }
    public int TextureSetCount { get; init; }
    public int SpriteCount { get; init; }
    public int SoundCount { get; init; }
    public int EnvironmentMapCount { get; init; }
    public bool IsEmpty { get; init; }
    public string? CustomThumbnailUrl { get; init; }
    public int ConceptImageCount { get; init; }
}
