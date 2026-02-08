using Application.Abstractions.Messaging;
using Stage = Domain.Models.Stage;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Stages;

internal sealed class UpdateStageCommandHandler : ICommandHandler<UpdateStageCommand, UpdateStageResponse>
{
    private readonly IStageRepository _stageRepository;

    public UpdateStageCommandHandler(IStageRepository stageRepository)
    {
        _stageRepository = stageRepository;
    }

    public async Task<Result<UpdateStageResponse>> Handle(UpdateStageCommand request, CancellationToken cancellationToken)
    {
        var stage = await _stageRepository.GetByIdAsync(request.Id, cancellationToken);
        
        if (stage == null)
        {
            return Result.Failure<UpdateStageResponse>(new Error("Stage.NotFound", $"Stage with ID {request.Id} not found"));
        }

        var updateResult = stage.UpdateConfiguration(request.ConfigurationJson);
        
        if (updateResult.IsFailure)
        {
            return Result.Failure<UpdateStageResponse>(updateResult.Error);
        }

        await _stageRepository.UpdateAsync(stage, cancellationToken);

        return Result.Success(new UpdateStageResponse(stage.Id, stage.Name));
    }
}
