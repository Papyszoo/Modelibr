using Application.Abstractions.Messaging;

namespace Application.Scenes;

public sealed record UpdateSceneCommand(int Id, string ConfigurationJson) : ICommand<UpdateSceneResponse>;

public sealed record UpdateSceneResponse(int Id, string Name);
