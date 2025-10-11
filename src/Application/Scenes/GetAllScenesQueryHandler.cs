using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Scenes;

internal sealed class GetAllScenesQueryHandler : IQueryHandler<GetAllScenesQuery, GetAllScenesResponse>
{
    private readonly ISceneRepository _sceneRepository;

    public GetAllScenesQueryHandler(ISceneRepository sceneRepository)
    {
        _sceneRepository = sceneRepository;
    }

    public async Task<Result<GetAllScenesResponse>> Handle(GetAllScenesQuery request, CancellationToken cancellationToken)
    {
        var scenes = await _sceneRepository.GetAllAsync(cancellationToken);
        
        var sceneDtos = scenes.Select(s => new SceneDto(s.Id, s.Name, s.CreatedAt, s.UpdatedAt));
        
        return Result.Success(new GetAllScenesResponse(sceneDtos));
    }
}
