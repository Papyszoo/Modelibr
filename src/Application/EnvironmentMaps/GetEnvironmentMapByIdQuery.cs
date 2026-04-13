using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.EnvironmentMaps;

internal sealed class GetEnvironmentMapByIdQueryHandler : IQueryHandler<GetEnvironmentMapByIdQuery, GetEnvironmentMapByIdResponse>
{
    private readonly IEnvironmentMapRepository _environmentMapRepository;

    public GetEnvironmentMapByIdQueryHandler(IEnvironmentMapRepository environmentMapRepository)
    {
        _environmentMapRepository = environmentMapRepository;
    }

    public async Task<Result<GetEnvironmentMapByIdResponse>> Handle(GetEnvironmentMapByIdQuery query, CancellationToken cancellationToken)
    {
        var environmentMap = await _environmentMapRepository.GetByIdAsync(query.Id, cancellationToken);
        if (environmentMap == null)
        {
            return Result.Failure<GetEnvironmentMapByIdResponse>(
                new Error("EnvironmentMapNotFound", $"Environment map with ID {query.Id} was not found."));
        }

        return Result.Success(new GetEnvironmentMapByIdResponse(EnvironmentMapDtoMappings.MapDetailDto(environmentMap)));
    }
}

public record GetEnvironmentMapByIdQuery(int Id) : IQuery<GetEnvironmentMapByIdResponse>;
public record GetEnvironmentMapByIdResponse(EnvironmentMapDetailDto EnvironmentMap);
