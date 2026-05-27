using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.EnvironmentMaps;

internal sealed class GetAllEnvironmentMapsQueryHandler : IQueryHandler<GetAllEnvironmentMapsQuery, GetAllEnvironmentMapsResponse>
{
    private readonly IEnvironmentMapRepository _environmentMapRepository;

    public GetAllEnvironmentMapsQueryHandler(IEnvironmentMapRepository environmentMapRepository)
    {
        _environmentMapRepository = environmentMapRepository;
    }

    public async Task<Result<GetAllEnvironmentMapsResponse>> Handle(GetAllEnvironmentMapsQuery query, CancellationToken cancellationToken)
    {
        IEnumerable<Domain.Models.EnvironmentMap> environmentMaps;
        int? totalCount = null;

        if (query.Page.HasValue && query.PageSize.HasValue)
        {
            var result = await _environmentMapRepository.GetPagedAsync(
                query.Page.Value,
                query.PageSize.Value,
                query.PackIds,
                query.ProjectIds,
                query.CategoryIds,
                query.SearchName,
                cancellationToken);

            environmentMaps = result.Items;
            totalCount = result.TotalCount;
        }
        else
        {
            environmentMaps = await _environmentMapRepository.GetAllAsync(cancellationToken);

            if (query.PackIds is { Count: > 0 })
                environmentMaps = environmentMaps.Where(e => e.Packs.Any(p => query.PackIds.Contains(p.Id)));

            if (query.ProjectIds is { Count: > 0 })
                environmentMaps = environmentMaps.Where(e => e.Projects.Any(p => query.ProjectIds.Contains(p.Id)));

            if (query.CategoryIds is { Count: > 0 })
                environmentMaps = environmentMaps.Where(e =>
                    e.EnvironmentMapCategoryId.HasValue &&
                    query.CategoryIds.Contains(e.EnvironmentMapCategoryId.Value));

            if (!string.IsNullOrWhiteSpace(query.SearchName))
            {
                var search = query.SearchName.Trim();
                environmentMaps = environmentMaps.Where(e =>
                    e.Name.Contains(search, StringComparison.OrdinalIgnoreCase));
            }
        }

        var items = environmentMaps
            .Select(EnvironmentMapDtoMappings.MapListDto)
            .ToList();

        int? totalPages = (totalCount.HasValue && query.PageSize.HasValue)
            ? (int)Math.Ceiling((double)totalCount.Value / query.PageSize.Value)
            : null;

        return Result.Success(new GetAllEnvironmentMapsResponse(items, totalCount, query.Page, query.PageSize, totalPages));
    }
}

public record GetAllEnvironmentMapsQuery(
    IReadOnlyCollection<int>? PackIds = null,
    IReadOnlyCollection<int>? ProjectIds = null,
    IReadOnlyCollection<int>? CategoryIds = null,
    string? SearchName = null,
    int? Page = null,
    int? PageSize = null) : IQuery<GetAllEnvironmentMapsResponse>;

public record GetAllEnvironmentMapsResponse(
    IReadOnlyList<EnvironmentMapListDto> EnvironmentMaps,
    int? TotalCount = null,
    int? Page = null,
    int? PageSize = null,
    int? TotalPages = null);
