using Application.Abstractions.Messaging;
using Stage = Domain.Models.Stage;

namespace Application.Stages;

public sealed record CreateStageCommand(string Name, string ConfigurationJson) : ICommand<CreateStageResponse>;

public sealed record CreateStageResponse(int Id, string Name);
