using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Environments;

internal class GetAllEnvironmentsQueryHandler : IQueryHandler<GetAllEnvironmentsQuery, GetAllEnvironmentsResponse>
{
    private readonly IEnvironmentRepository _environmentRepository;

    public GetAllEnvironmentsQueryHandler(IEnvironmentRepository environmentRepository)
    {
        _environmentRepository = environmentRepository;
    }

    public async Task<Result<GetAllEnvironmentsResponse>> Handle(GetAllEnvironmentsQuery query, CancellationToken cancellationToken)
    {
        var environments = await _environmentRepository.GetAllAsync(cancellationToken);
        
        var environmentDtos = environments.Select(e => new EnvironmentDto(
            e.Id,
            e.Name,
            e.Description,
            e.IsDefault,
            e.LightIntensity,
            e.EnvironmentPreset,
            e.ShowShadows,
            e.ShadowType,
            e.ShadowOpacity,
            e.ShadowBlur,
            e.AutoAdjustCamera,
            e.CameraDistance,
            e.CameraAngle,
            e.BackgroundModelId,
            e.CreatedAt,
            e.UpdatedAt
        )).ToList();

        return Result.Success(new GetAllEnvironmentsResponse(environmentDtos));
    }
}

public record GetAllEnvironmentsQuery : IQuery<GetAllEnvironmentsResponse>;

public record GetAllEnvironmentsResponse(List<EnvironmentDto> Environments);

public record EnvironmentDto(
    int Id,
    string Name,
    string? Description,
    bool IsDefault,
    double LightIntensity,
    string EnvironmentPreset,
    bool ShowShadows,
    string? ShadowType,
    double ShadowOpacity,
    double ShadowBlur,
    bool AutoAdjustCamera,
    double? CameraDistance,
    double? CameraAngle,
    int? BackgroundModelId,
    DateTime CreatedAt,
    DateTime UpdatedAt);
