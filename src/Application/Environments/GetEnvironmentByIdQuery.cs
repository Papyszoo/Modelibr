using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Environments;

internal class GetEnvironmentByIdQueryHandler : IQueryHandler<GetEnvironmentByIdQuery, GetEnvironmentByIdResponse>
{
    private readonly IEnvironmentRepository _environmentRepository;

    public GetEnvironmentByIdQueryHandler(IEnvironmentRepository environmentRepository)
    {
        _environmentRepository = environmentRepository;
    }

    public async Task<Result<GetEnvironmentByIdResponse>> Handle(GetEnvironmentByIdQuery query, CancellationToken cancellationToken)
    {
        var environment = await _environmentRepository.GetByIdAsync(query.Id, cancellationToken);

        if (environment == null)
        {
            return Result.Failure<GetEnvironmentByIdResponse>(
                new Error("EnvironmentNotFound", $"Environment with ID {query.Id} was not found."));
        }

        var dto = new EnvironmentDto(
            environment.Id,
            environment.Name,
            environment.Description,
            environment.IsDefault,
            environment.LightIntensity,
            environment.EnvironmentPreset,
            environment.ShowShadows,
            environment.ShadowType,
            environment.ShadowOpacity,
            environment.ShadowBlur,
            environment.AutoAdjustCamera,
            environment.CameraDistance,
            environment.CameraAngle,
            environment.BackgroundModelId,
            environment.CreatedAt,
            environment.UpdatedAt
        );

        return Result.Success(new GetEnvironmentByIdResponse(dto));
    }
}

public record GetEnvironmentByIdQuery(int Id) : IQuery<GetEnvironmentByIdResponse>;

public record GetEnvironmentByIdResponse(EnvironmentDto Environment);
