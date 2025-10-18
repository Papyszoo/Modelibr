using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Settings;

internal class GetAllSettingsQueryHandler : IQueryHandler<GetAllSettingsQuery, GetAllSettingsQueryResponse>
{
    private readonly ISettingRepository _settingRepository;

    public GetAllSettingsQueryHandler(ISettingRepository settingRepository)
    {
        _settingRepository = settingRepository;
    }

    public async Task<Result<GetAllSettingsQueryResponse>> Handle(GetAllSettingsQuery query, CancellationToken cancellationToken)
    {
        var settings = await _settingRepository.GetAllAsync(cancellationToken);
        
        var settingDtos = settings.Select(s => new SettingDto(
            s.Key,
            s.Value,
            s.Description,
            s.CreatedAt,
            s.UpdatedAt
        )).ToList();

        return Result.Success(new GetAllSettingsQueryResponse(settingDtos));
    }
}
