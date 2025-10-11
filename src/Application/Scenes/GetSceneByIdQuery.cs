using Application.Abstractions.Messaging;

namespace Application.Scenes;

public sealed record GetSceneByIdQuery(int Id) : IQuery<GetSceneByIdResponse>;

public sealed record GetSceneByIdResponse(int Id, string Name, string ConfigurationJson, DateTime CreatedAt, DateTime UpdatedAt);
