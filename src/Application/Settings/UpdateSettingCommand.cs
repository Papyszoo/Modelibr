using Application.Abstractions.Messaging;

namespace Application.Settings;

public record UpdateSettingCommand(
    string Key,
    string Value
) : ICommand<UpdateSettingResponse>;

public record UpdateSettingResponse(
    string Key,
    string Value,
    DateTime UpdatedAt
);
