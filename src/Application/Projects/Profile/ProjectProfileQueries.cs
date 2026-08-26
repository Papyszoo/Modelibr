using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Projects;
using SharedKernel;

namespace Application.Projects.Profile;

/// <summary>The full brief for one project (prompt 13-D1).</summary>
public sealed record GetProjectBriefQuery(int ProjectId) : IQuery<ProjectBriefDto>;

internal sealed class GetProjectBriefQueryHandler : IQueryHandler<GetProjectBriefQuery, ProjectBriefDto>
{
    private readonly IProjectRepository _projects;

    public GetProjectBriefQueryHandler(IProjectRepository projects) => _projects = projects;

    public async Task<Result<ProjectBriefDto>> Handle(
        GetProjectBriefQuery query, CancellationToken cancellationToken)
    {
        var project = await _projects.GetByIdAsync(query.ProjectId, cancellationToken);
        if (project is null)
        {
            return Result.Failure<ProjectBriefDto>(
                new Error("ProjectNotFound", $"Project with ID {query.ProjectId} was not found."));
        }

        return Result.Success(ProjectBriefBuilder.Build(project));
    }
}

/// <summary>Every project, one line each - what an agent lists before it picks one.</summary>
public sealed record ListProjectsQuery : IQuery<IReadOnlyList<ProjectSummaryDto>>;

internal sealed class ListProjectsQueryHandler
    : IQueryHandler<ListProjectsQuery, IReadOnlyList<ProjectSummaryDto>>
{
    private readonly IProjectRepository _projects;

    public ListProjectsQueryHandler(IProjectRepository projects) => _projects = projects;

    public async Task<Result<IReadOnlyList<ProjectSummaryDto>>> Handle(
        ListProjectsQuery query, CancellationToken cancellationToken)
    {
        var projects = await _projects.GetAllAsync(cancellationToken);

        return Result.Success<IReadOnlyList<ProjectSummaryDto>>(
            projects
                .OrderBy(p => p.Name, StringComparer.OrdinalIgnoreCase)
                .Select(ProjectBriefBuilder.Summarize)
                .ToList());
    }
}

/// <summary>The profile vocabulary a picker offers.</summary>
/// <param name="Dimension">One dimension, or null for all five.</param>
public sealed record GetProjectProfileOptionsQuery(string? Dimension = null, bool IncludeHidden = false)
    : IQuery<IReadOnlyList<ProjectProfileOptionDto>>;

internal sealed class GetProjectProfileOptionsQueryHandler
    : IQueryHandler<GetProjectProfileOptionsQuery, IReadOnlyList<ProjectProfileOptionDto>>
{
    private readonly IProjectProfileOptionRepository _options;

    public GetProjectProfileOptionsQueryHandler(IProjectProfileOptionRepository options) => _options = options;

    public async Task<Result<IReadOnlyList<ProjectProfileOptionDto>>> Handle(
        GetProjectProfileOptionsQuery query, CancellationToken cancellationToken)
    {
        if (query.Dimension is not null && ProjectProfileDimensions.Normalize(query.Dimension) is null)
        {
            return Result.Failure<IReadOnlyList<ProjectProfileOptionDto>>(new Error(
                "UnknownProfileDimension",
                $"'{query.Dimension}' is not a profile dimension. Known: {string.Join(", ", ProjectProfileDimensions.All)}."));
        }

        var options = query.Dimension is null
            ? await _options.GetAllAsync(query.IncludeHidden, cancellationToken)
            : await _options.GetByDimensionAsync(
                ProjectProfileDimensions.Normalize(query.Dimension)!, query.IncludeHidden, cancellationToken);

        return Result.Success<IReadOnlyList<ProjectProfileOptionDto>>(
            options
                .Select(o => new ProjectProfileOptionDto(
                    o.Id, o.Dimension, o.Name, o.IsBuiltIn, o.IsHidden, o.SortOrder))
                .ToList());
    }
}
