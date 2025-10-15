using Application.Abstractions.Messaging;
using Stage = Domain.Models.Stage;

namespace Application.Stages;

public sealed record UpdateStageCommand(int Id, string ConfigurationJson) : ICommand<UpdateStageResponse>;

public sealed record UpdateStageResponse(int Id, string Name);
