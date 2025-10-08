using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Services;
using SharedKernel;

namespace Application.Settings;

internal class GetSettingsQueryHandler : IQueryHandler<GetSettingsQuery, GetSettingsQueryResponse>
{
    private readonly IApplicationSettingsRepository _settingsRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public GetSettingsQueryHandler(
        IApplicationSettingsRepository settingsRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _settingsRepository = settingsRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<GetSettingsQueryResponse>> Handle(GetSettingsQuery query, CancellationToken cancellationToken)
    {
        var settings = await _settingsRepository.GetAsync(cancellationToken);
        
        // If no settings exist, create default settings
        if (settings == null)
        {
            settings = Domain.Models.ApplicationSettings.CreateDefault(_dateTimeProvider.UtcNow);
            settings = await _settingsRepository.SaveAsync(settings, cancellationToken);
        }

        var response = new GetSettingsQueryResponse(
            settings.MaxFileSizeBytes,
            settings.MaxThumbnailSizeBytes,
            settings.ThumbnailFrameCount,
            settings.ThumbnailCameraVerticalAngle,
            settings.ThumbnailWidth,
            settings.ThumbnailHeight,
            settings.GenerateThumbnailOnUpload,
            settings.CreatedAt,
            settings.UpdatedAt
        );

        return Result.Success(response);
    }
}
