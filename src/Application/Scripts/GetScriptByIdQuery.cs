using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Scripts;

internal class GetScriptByIdQueryHandler : IQueryHandler<GetScriptByIdQuery, GetScriptByIdResponse>
{
    private readonly IScriptRepository _scriptRepository;

    public GetScriptByIdQueryHandler(IScriptRepository scriptRepository)
    {
        _scriptRepository = scriptRepository;
    }

    public async Task<Result<GetScriptByIdResponse>> Handle(GetScriptByIdQuery query, CancellationToken cancellationToken)
    {
        var script = await _scriptRepository.GetByIdAsync(query.Id, cancellationToken);

        if (script == null)
        {
            return Result.Failure<GetScriptByIdResponse>(
                new Error("ScriptNotFound", $"Script with ID {query.Id} not found."));
        }

        return Result.Success(new GetScriptByIdResponse(ScriptMappings.ToDto(script)));
    }
}

public record GetScriptByIdQuery(int Id) : IQuery<GetScriptByIdResponse>;
public record GetScriptByIdResponse(ScriptDto Script);
