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
                query.PackId,
                query.ProjectId,
                cancellationToken);

            environmentMaps = result.Items;
            totalCount = result.TotalCount;
        }
        else
        {
            environmentMaps = await _environmentMapRepository.GetAllAsync(cancellationToken);

            if (query.PackId.HasValue)
                environmentMaps = environmentMaps.Where(e => e.Packs.Any(p => p.Id == query.PackId.Value));

            if (query.ProjectId.HasValue)
                environmentMaps = environmentMaps.Where(e => e.Projects.Any(p => p.Id == query.ProjectId.Value));
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
    int? PackId = null,
    int? ProjectId = null,
    int? Page = null,
    int? PageSize = null) : IQuery<GetAllEnvironmentMapsResponse>;

public record GetAllEnvironmentMapsResponse(
    IReadOnlyList<EnvironmentMapListDto> EnvironmentMaps,
    int? TotalCount = null,
    int? Page = null,
    int? PageSize = null,
    int? TotalPages = null);
