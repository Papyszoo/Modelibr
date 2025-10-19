using Application.Abstractions.Messaging;

namespace Application.Settings;

public record GetAllSettingsQuery : IQuery<GetAllSettingsQueryResponse>;

public record GetAllSettingsQueryResponse(
    IReadOnlyList<SettingDto> Settings
);

public record SettingDto(
    string Key,
    string Value,
    string? Description,
    DateTime CreatedAt,
    DateTime UpdatedAt
);
