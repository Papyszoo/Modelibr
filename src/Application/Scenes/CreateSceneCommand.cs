using Application.Abstractions.Messaging;

namespace Application.Scenes;

public sealed record CreateSceneCommand(string Name, string ConfigurationJson) : ICommand<CreateSceneResponse>;

public sealed record CreateSceneResponse(int Id, string Name);
