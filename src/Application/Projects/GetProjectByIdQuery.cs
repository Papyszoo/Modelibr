using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Projects;

internal class GetProjectByIdQueryHandler : IQueryHandler<GetProjectByIdQuery, ProjectDto>
{
    private readonly IProjectRepository _projectRepository;

    public GetProjectByIdQueryHandler(IProjectRepository projectRepository)
    {
        _projectRepository = projectRepository;
    }

    public async Task<Result<ProjectDto>> Handle(GetProjectByIdQuery query, CancellationToken cancellationToken)
    {
        var project = await _projectRepository.GetByIdAsync(query.Id, cancellationToken);

        if (project == null)
        {
            return Result.Failure<ProjectDto>(
                new Error("ProjectNotFound", $"Project with ID {query.Id} was not found."));
        }

        var projectDto = new ProjectDto
        {
            Id = project.Id,
            Name = project.Name,
            Description = project.Description,
            CreatedAt = project.CreatedAt,
            UpdatedAt = project.UpdatedAt,
            ModelCount = project.ModelCount,
            TextureSetCount = project.TextureSetCount,
            IsEmpty = project.IsEmpty,
            Models = project.Models.Select(m => new ProjectModelDto
            {
                Id = m.Id,
                Name = m.Name
            }).ToList(),
            TextureSets = project.TextureSets.Select(ts => new ProjectTextureSetDto
            {
                Id = ts.Id,
                Name = ts.Name
            }).ToList()
        };

        return Result.Success(projectDto);
    }
}

public record GetProjectByIdQuery(int Id) : IQuery<ProjectDto>;
