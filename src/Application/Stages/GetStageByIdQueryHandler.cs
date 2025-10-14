using Application.Abstractions.Messaging;
using Stage = Domain.Models.Stage;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Stages;

internal sealed class GetStageByIdQueryHandler : IQueryHandler<GetStageByIdQuery, GetStageByIdResponse>
{
    private readonly IStageRepository _stageRepository;

    public GetStageByIdQueryHandler(IStageRepository stageRepository)
    {
        _stageRepository = stageRepository;
    }

    public async Task<Result<GetStageByIdResponse>> Handle(GetStageByIdQuery request, CancellationToken cancellationToken)
    {
        var stage = await _stageRepository.GetByIdAsync(request.Id, cancellationToken);
        
        if (stage == null)
        {
            return Result.Failure<GetStageByIdResponse>(new Error("Stage.NotFound", $"Stage with ID {request.Id} not found"));
        }
        
        return Result.Success(new GetStageByIdResponse(
            stage.Id, 
            stage.Name, 
            stage.ConfigurationJson, 
            stage.CreatedAt, 
            stage.UpdatedAt
        ));
    }
}
