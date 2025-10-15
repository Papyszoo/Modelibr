using Application.Abstractions.Messaging;
using Stage = Domain.Models.Stage;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Stages;

internal sealed class GetAllStagesQueryHandler : IQueryHandler<GetAllStagesQuery, GetAllStagesResponse>
{
    private readonly IStageRepository _stageRepository;

    public GetAllStagesQueryHandler(IStageRepository stageRepository)
    {
        _stageRepository = stageRepository;
    }

    public async Task<Result<GetAllStagesResponse>> Handle(GetAllStagesQuery request, CancellationToken cancellationToken)
    {
        var stages = await _stageRepository.GetAllAsync(cancellationToken);
        
        var stageDtos = stages.Select(s => new StageDto(s.Id, s.Name, s.TsxFilePath, s.CreatedAt, s.UpdatedAt));
        
        return Result.Success(new GetAllStagesResponse(stageDtos));
    }
}
