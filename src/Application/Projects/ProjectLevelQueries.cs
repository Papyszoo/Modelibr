using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Projects;

public sealed record GetProjectLevelsQuery(int ProjectId)
    : IQuery<IReadOnlyList<ProjectLevelDto>>;

internal sealed class GetProjectLevelsQueryHandler
    : IQueryHandler<GetProjectLevelsQuery, IReadOnlyList<ProjectLevelDto>>
{
    private readonly IProjectLevelRepository _levels;

    public GetProjectLevelsQueryHandler(IProjectLevelRepository levels)
    {
        _levels = levels;
    }

    public async Task<Result<IReadOnlyList<ProjectLevelDto>>> Handle(
        GetProjectLevelsQuery query,
        CancellationToken cancellationToken)
    {
        var levels = await _levels.GetForProjectAsync(query.ProjectId, cancellationToken);
        return Result.Success<IReadOnlyList<ProjectLevelDto>>(levels
            .Select(ProjectLevelView.From)
            .ToList());
    }
}

public sealed record GetProjectLevelByIdQuery(int ProjectId, int LevelId)
    : IQuery<ProjectLevelDto>;

internal sealed class GetProjectLevelByIdQueryHandler
    : IQueryHandler<GetProjectLevelByIdQuery, ProjectLevelDto>
{
    private readonly IProjectLevelRepository _levels;

    public GetProjectLevelByIdQueryHandler(IProjectLevelRepository levels)
    {
        _levels = levels;
    }

    public async Task<Result<ProjectLevelDto>> Handle(
        GetProjectLevelByIdQuery query,
        CancellationToken cancellationToken)
    {
        var level = await _levels.GetByIdAsync(query.ProjectId, query.LevelId, cancellationToken);
        return level is null
            ? Result.Failure<ProjectLevelDto>(new Error(
                "ProjectLevelNotFound",
                $"Level {query.LevelId} was not found in project {query.ProjectId}."))
            : Result.Success(ProjectLevelView.From(level));
    }
}
