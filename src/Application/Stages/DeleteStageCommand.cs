using Application.Abstractions.Messaging;

namespace Application.Stages;

public record DeleteStageCommand(int StageId) : ICommand<DeleteStageResponse>;

public record DeleteStageResponse(int StageId, bool Success);
