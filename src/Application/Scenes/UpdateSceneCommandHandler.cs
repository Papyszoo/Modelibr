using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Scenes;

internal sealed class UpdateSceneCommandHandler : ICommandHandler<UpdateSceneCommand, UpdateSceneResponse>
{
    private readonly ISceneRepository _sceneRepository;

    public UpdateSceneCommandHandler(ISceneRepository sceneRepository)
    {
        _sceneRepository = sceneRepository;
    }

    public async Task<Result<UpdateSceneResponse>> Handle(UpdateSceneCommand request, CancellationToken cancellationToken)
    {
        var scene = await _sceneRepository.GetByIdAsync(request.Id, cancellationToken);
        
        if (scene == null)
        {
            return Result.Failure<UpdateSceneResponse>(new Error("Scene.NotFound", $"Scene with ID {request.Id} not found"));
        }

        var updateResult = scene.UpdateConfiguration(request.ConfigurationJson);
        
        if (!updateResult.IsSuccess)
        {
            return Result.Failure<UpdateSceneResponse>(updateResult.Error);
        }

        await _sceneRepository.UpdateAsync(scene, cancellationToken);

        return Result.Success(new UpdateSceneResponse(scene.Id, scene.Name));
    }
}
