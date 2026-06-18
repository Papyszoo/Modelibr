using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using SharedKernel;

namespace Application.Scripts;

internal class GetAllScriptsQueryHandler : IQueryHandler<GetAllScriptsQuery, GetAllScriptsResponse>
{
    private readonly IScriptRepository _scriptRepository;

    public GetAllScriptsQueryHandler(IScriptRepository scriptRepository)
    {
        _scriptRepository = scriptRepository;
    }

    public async Task<Result<GetAllScriptsResponse>> Handle(GetAllScriptsQuery query, CancellationToken cancellationToken)
    {
        IEnumerable<Script> scriptsList;
        int? totalCount = null;

        if (query.Page.HasValue && query.PageSize.HasValue)
        {
            var result = await _scriptRepository.GetPagedAsync(
                query.Page.Value, query.PageSize.Value,
                query.PackIds, query.ProjectIds, query.CategoryIds,
                query.SearchName, query.Language,
                cancellationToken);
            scriptsList = result.Items;
            totalCount = result.TotalCount;
        }
        else
        {
            var scripts = await _scriptRepository.GetAllAsync(cancellationToken);
            var filtered = scripts.Where(s => !s.IsDeleted);

            if (query.PackIds is { Count: > 0 })
                filtered = filtered.Where(s => s.Packs.Any(p => query.PackIds.Contains(p.Id)));
            if (query.ProjectIds is { Count: > 0 })
                filtered = filtered.Where(s => s.Projects.Any(p => query.ProjectIds.Contains(p.Id)));
            if (query.CategoryIds is { Count: > 0 })
                filtered = filtered.Where(s =>
                    s.ScriptCategoryId.HasValue &&
                    query.CategoryIds.Contains(s.ScriptCategoryId.Value));
            if (!string.IsNullOrWhiteSpace(query.SearchName))
            {
                var search = query.SearchName.Trim();
                filtered = filtered.Where(s =>
                    s.Name.Contains(search, StringComparison.OrdinalIgnoreCase));
            }
            if (!string.IsNullOrWhiteSpace(query.Language))
                filtered = filtered.Where(s =>
                    s.Language.Equals(query.Language, StringComparison.OrdinalIgnoreCase));

            scriptsList = filtered.ToList();
        }

        var scriptDtos = scriptsList
            .Select(ScriptMappings.ToDto)
            .ToList();

        int? totalPages = (totalCount.HasValue && query.PageSize.HasValue)
            ? (int)Math.Ceiling((double)totalCount.Value / query.PageSize.Value)
            : null;

        return Result.Success(new GetAllScriptsResponse(scriptDtos, totalCount, query.Page, query.PageSize, totalPages));
    }
}

public record GetAllScriptsQuery(
    IReadOnlyCollection<int>? PackIds = null,
    IReadOnlyCollection<int>? ProjectIds = null,
    IReadOnlyCollection<int>? CategoryIds = null,
    string? SearchName = null,
    string? Language = null,
    int? Page = null,
    int? PageSize = null) : IQuery<GetAllScriptsResponse>;

public record GetAllScriptsResponse(IReadOnlyList<ScriptDto> Scripts, int? TotalCount = null, int? Page = null, int? PageSize = null, int? TotalPages = null);

public record ScriptDto(
    int Id,
    string Name,
    int FileId,
    int? CategoryId,
    string? CategoryName,
    string Language,
    int LineCount,
    string FileName,
    long FileSizeBytes,
    string? Description,
    DateTime CreatedAt,
    DateTime UpdatedAt);

internal static class ScriptMappings
{
    internal static ScriptDto ToDto(Script s) => new(
        s.Id,
        s.Name,
        s.FileId,
        s.ScriptCategoryId,
        s.Category?.Name,
        s.Language,
        s.LineCount,
        s.File?.OriginalFileName ?? "",
        s.File?.SizeBytes ?? s.SizeBytes,
        s.Description,
        s.CreatedAt,
        s.UpdatedAt);

    /// <summary>Counts lines of source text (0 for empty, newline count + 1 otherwise).</summary>
    internal static int CountLines(string content)
        => string.IsNullOrEmpty(content) ? 0 : content.Count(c => c == '\n') + 1;
}
