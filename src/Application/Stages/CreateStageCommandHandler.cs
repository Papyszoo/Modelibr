using Application.Abstractions.Messaging;
using Stage = Domain.Models.Stage;
using Application.Abstractions.Repositories;
using Domain.Models;
using SharedKernel;

namespace Application.Stages;

internal sealed class CreateStageCommandHandler : ICommandHandler<CreateStageCommand, CreateStageResponse>
{
    private readonly IStageRepository _stageRepository;

    public CreateStageCommandHandler(IStageRepository stageRepository)
    {
        _stageRepository = stageRepository;
    }

    public async Task<Result<CreateStageResponse>> Handle(CreateStageCommand request, CancellationToken cancellationToken)
    {
        var stageResult = Stage.Create(request.Name, request.ConfigurationJson);
        
        if (!stageResult.IsSuccess)
        {
            return Result.Failure<CreateStageResponse>(stageResult.Error);
        }

        await _stageRepository.AddAsync(stageResult.Value, cancellationToken);

        return Result.Success(new CreateStageResponse(stageResult.Value.Id, stageResult.Value.Name));
    }
}
