using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Search;

internal sealed class GlobalSearchQueryHandler
    : IQueryHandler<GlobalSearchQuery, GlobalSearchResponse>
{
    private const int MaxPerTypeLimit = 25;
    private readonly ISearchRepository _searchRepository;

    public GlobalSearchQueryHandler(ISearchRepository searchRepository)
    {
        _searchRepository = searchRepository;
    }

    public async Task<Result<GlobalSearchResponse>> Handle(
        GlobalSearchQuery query,
        CancellationToken cancellationToken)
    {
        var term = query.Term?.Trim() ?? string.Empty;
        if (term.Length == 0)
        {
            return Result.Success(new GlobalSearchResponse(Array.Empty<SearchResultGroup>()));
        }

        var limit = Math.Clamp(query.PerTypeLimit, 1, MaxPerTypeLimit);
        var groups = await _searchRepository.SearchAsync(term, limit, cancellationToken);
        return Result.Success(new GlobalSearchResponse(groups));
    }
}
