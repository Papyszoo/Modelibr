using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Projects;

public sealed record GetProjectCharactersQuery(int ProjectId)
    : IQuery<IReadOnlyList<ProjectCharacterDto>>;

internal sealed class GetProjectCharactersQueryHandler
    : IQueryHandler<GetProjectCharactersQuery, IReadOnlyList<ProjectCharacterDto>>
{
    private readonly IProjectCharacterRepository _characters;

    public GetProjectCharactersQueryHandler(IProjectCharacterRepository characters)
    {
        _characters = characters;
    }

    public async Task<Result<IReadOnlyList<ProjectCharacterDto>>> Handle(
        GetProjectCharactersQuery query,
        CancellationToken cancellationToken)
    {
        var characters = await _characters.GetForProjectAsync(query.ProjectId, cancellationToken);
        return Result.Success<IReadOnlyList<ProjectCharacterDto>>(characters
            .Select(ProjectCharacterView.From)
            .ToList());
    }
}

public sealed record GetProjectCharacterByIdQuery(int ProjectId, int CharacterId)
    : IQuery<ProjectCharacterDto>;

internal sealed class GetProjectCharacterByIdQueryHandler
    : IQueryHandler<GetProjectCharacterByIdQuery, ProjectCharacterDto>
{
    private readonly IProjectCharacterRepository _characters;

    public GetProjectCharacterByIdQueryHandler(IProjectCharacterRepository characters)
    {
        _characters = characters;
    }

    public async Task<Result<ProjectCharacterDto>> Handle(
        GetProjectCharacterByIdQuery query,
        CancellationToken cancellationToken)
    {
        var character = await _characters.GetByIdAsync(query.ProjectId, query.CharacterId, cancellationToken);
        return character is null
            ? Result.Failure<ProjectCharacterDto>(new Error(
                "ProjectCharacterNotFound",
                $"Character {query.CharacterId} was not found in project {query.ProjectId}."))
            : Result.Success(ProjectCharacterView.From(character));
    }
}
