using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Services;
using SharedKernel;

namespace Application.Scenes;

/// <summary>
/// Asks for a picture of a scene. Returns immediately with the id to collect it by -
/// waiting is the caller's business, because the editor wants to fire and forget while an
/// agent wants to block for a round trip.
/// </summary>
internal class RequestSceneRenderCommandHandler : ICommandHandler<RequestSceneRenderCommand, RequestSceneRenderResponse>
{
    /// <summary>
    /// The angles the render page understands. Validated here rather than at the renderer
    /// because an unrecognised value does not fail loudly downstream: the app serves its
    /// normal self for a query string it does not know and simply never publishes a
    /// status, so a typo surfaces as a render that times out sixty seconds later.
    /// </summary>
    private static readonly string[] Viewpoints = ["iso", "front", "side", "top"];

    private readonly ISceneRepository _sceneRepository;
    private readonly IThumbnailQueue _thumbnailQueue;

    public RequestSceneRenderCommandHandler(
        ISceneRepository sceneRepository,
        IThumbnailQueue thumbnailQueue)
    {
        _sceneRepository = sceneRepository;
        _thumbnailQueue = thumbnailQueue;
    }

    public async Task<Result<RequestSceneRenderResponse>> Handle(RequestSceneRenderCommand command, CancellationToken cancellationToken)
    {
        var viewpoint = string.IsNullOrWhiteSpace(command.Viewpoint)
            ? "iso"
            : command.Viewpoint.Trim().ToLowerInvariant();

        if (!Viewpoints.Contains(viewpoint))
        {
            return Result.Failure<RequestSceneRenderResponse>(new Error(
                "Scene.UnknownViewpoint",
                $"Unknown viewpoint '{command.Viewpoint}'. Expected one of: {string.Join(", ", Viewpoints)}."));
        }

        var scene = await _sceneRepository.GetByIdAsync(command.SceneId, cancellationToken);
        if (scene is null)
        {
            return Result.Failure<RequestSceneRenderResponse>(new Error(
                "Scene.NotFound", $"Scene with ID {command.SceneId} was not found."));
        }

        var job = await _thumbnailQueue.EnqueueSceneRenderAsync(
            command.SceneId, viewpoint, cancellationToken: cancellationToken);

        return Result.Success(new RequestSceneRenderResponse(job.Id, command.SceneId, viewpoint));
    }
}

public record RequestSceneRenderCommand(int SceneId, string? Viewpoint = null)
    : ICommand<RequestSceneRenderResponse>;

/// <summary>
/// <paramref name="RenderId"/> is the queue job's id. It is what a caller polls with when
/// the render outlives its patience.
/// </summary>
public record RequestSceneRenderResponse(int RenderId, int SceneId, string Viewpoint);
