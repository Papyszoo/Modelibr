using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using SharedKernel;

namespace Application.ScriptTemplates;

internal class GetAllScriptTemplatesQueryHandler : IQueryHandler<GetAllScriptTemplatesQuery, GetAllScriptTemplatesResponse>
{
    private readonly IScriptTemplateRepository _repository;

    public GetAllScriptTemplatesQueryHandler(IScriptTemplateRepository repository)
    {
        _repository = repository;
    }

    public async Task<Result<GetAllScriptTemplatesResponse>> Handle(GetAllScriptTemplatesQuery query, CancellationToken cancellationToken)
    {
        var custom = await _repository.GetAllAsync(cancellationToken);

        // Built-ins first, then user templates sorted by name.
        var templates = BuiltInScriptTemplates.All
            .Concat(custom
                .OrderBy(t => t.Name)
                .Select(ScriptTemplateMappings.ToDto))
            .ToList();

        return Result.Success(new GetAllScriptTemplatesResponse(templates));
    }
}

public record GetAllScriptTemplatesQuery : IQuery<GetAllScriptTemplatesResponse>;

public record GetAllScriptTemplatesResponse(IReadOnlyList<ScriptTemplateDto> Templates);

internal static class ScriptTemplateMappings
{
    internal static ScriptTemplateDto ToDto(ScriptTemplate t) => new(
        t.Id.ToString(),
        t.Name,
        t.Language,
        t.Description,
        t.Content,
        false);
}
