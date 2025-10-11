using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Domain.Models;
using SharedKernel;

namespace Application.Scenes;

internal sealed class CreateSceneCommandHandler : ICommandHandler<CreateSceneCommand, CreateSceneResponse>
{
    private readonly ISceneRepository _sceneRepository;

    public CreateSceneCommandHandler(ISceneRepository sceneRepository)
    {
        _sceneRepository = sceneRepository;
    }

    public async Task<Result<CreateSceneResponse>> Handle(CreateSceneCommand request, CancellationToken cancellationToken)
    {
        var sceneResult = Scene.Create(request.Name, request.ConfigurationJson);
        
        if (!sceneResult.IsSuccess)
        {
            return Result.Failure<CreateSceneResponse>(sceneResult.Error);
        }

        await _sceneRepository.AddAsync(sceneResult.Value, cancellationToken);

        return Result.Success(new CreateSceneResponse(sceneResult.Value.Id, sceneResult.Value.Name));
    }
}
