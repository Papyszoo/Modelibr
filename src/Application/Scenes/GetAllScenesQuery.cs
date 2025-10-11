using Application.Abstractions.Messaging;

namespace Application.Scenes;

public sealed record GetAllScenesQuery : IQuery<GetAllScenesResponse>;

public sealed record GetAllScenesResponse(IEnumerable<SceneDto> Scenes);

public sealed record SceneDto(int Id, string Name, DateTime CreatedAt, DateTime UpdatedAt);
