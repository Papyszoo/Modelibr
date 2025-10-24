using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Stages;

internal class DeleteStageCommandHandler : ICommandHandler<DeleteStageCommand, DeleteStageResponse>
{
    private readonly IStageRepository _stageRepository;

    public DeleteStageCommandHandler(IStageRepository stageRepository)
    {
        _stageRepository = stageRepository;
    }

    public async Task<Result<DeleteStageResponse>> Handle(DeleteStageCommand command, CancellationToken cancellationToken)
    {
        var stage = await _stageRepository.GetByIdAsync(command.StageId, cancellationToken);
        
        if (stage == null)
        {
            return Result.Failure<DeleteStageResponse>(
                new Error("StageNotFound", $"Stage with ID {command.StageId} was not found."));
        }

        await _stageRepository.DeleteAsync(command.StageId, cancellationToken);

        return Result.Success(new DeleteStageResponse(command.StageId, true));
    }
}
