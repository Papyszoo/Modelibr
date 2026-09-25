using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Projects;

public sealed record GetProjectReferencesQuery(
    int ProjectId,
    int? LevelId = null,
    int? CharacterId = null)
    : IQuery<IReadOnlyList<ProjectReferenceDto>>;

internal sealed class GetProjectReferencesQueryHandler
    : IQueryHandler<GetProjectReferencesQuery, IReadOnlyList<ProjectReferenceDto>>
{
    private readonly IProjectReferenceRepository _references;

    public GetProjectReferencesQueryHandler(IProjectReferenceRepository references)
    {
        _references = references;
    }

    public async Task<Result<IReadOnlyList<ProjectReferenceDto>>> Handle(
        GetProjectReferencesQuery query,
        CancellationToken cancellationToken)
    {
        var references = await _references.GetForProjectAsync(
            query.ProjectId,
            query.LevelId,
            query.CharacterId,
            cancellationToken);
        return Result.Success<IReadOnlyList<ProjectReferenceDto>>(references
            .Select(ProjectReferenceView.From)
            .ToList());
    }
}
