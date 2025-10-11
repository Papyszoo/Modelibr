using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Scenes;

internal sealed class GetSceneByIdQueryHandler : IQueryHandler<GetSceneByIdQuery, GetSceneByIdResponse>
{
    private readonly ISceneRepository _sceneRepository;

    public GetSceneByIdQueryHandler(ISceneRepository sceneRepository)
    {
        _sceneRepository = sceneRepository;
    }

    public async Task<Result<GetSceneByIdResponse>> Handle(GetSceneByIdQuery request, CancellationToken cancellationToken)
    {
        var scene = await _sceneRepository.GetByIdAsync(request.Id, cancellationToken);
        
        if (scene == null)
        {
            return Result.Failure<GetSceneByIdResponse>(new Error("Scene.NotFound", $"Scene with ID {request.Id} not found"));
        }
        
        return Result.Success(new GetSceneByIdResponse(
            scene.Id, 
            scene.Name, 
            scene.ConfigurationJson, 
            scene.CreatedAt, 
            scene.UpdatedAt
        ));
    }
}
