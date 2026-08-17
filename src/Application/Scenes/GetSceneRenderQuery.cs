using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Scenes;

/// <summary>
/// Collects a render by the id <see cref="RequestSceneRenderCommand"/> handed out.
///
/// Answers while the render is still in flight rather than 404-ing, because the caller
/// polling this is one that already asked and was told to come back. "Not ready yet" and
/// "no such request" are different answers and an agent has to be able to tell them apart
/// - one means wait, the other means it lost the id.
/// </summary>
internal class GetSceneRenderQueryHandler : IQueryHandler<GetSceneRenderQuery, SceneRenderView>
{
    private readonly ISceneRenderRepository _renderRepository;
    private readonly IThumbnailJobRepository _jobRepository;

    public GetSceneRenderQueryHandler(
        ISceneRenderRepository renderRepository,
        IThumbnailJobRepository jobRepository)
    {
        _renderRepository = renderRepository;
        _jobRepository = jobRepository;
    }

    public async Task<Result<SceneRenderView>> Handle(GetSceneRenderQuery query, CancellationToken cancellationToken)
    {
        var render = await _renderRepository.GetByJobIdAsync(query.RenderId, cancellationToken);
        if (render is not null)
        {
            return Result.Success(new SceneRenderView(
                render.ThumbnailJobId,
                render.SceneId,
                render.Viewpoint,
                Status: "Ready",
                render.Width,
                render.Height,
                render.SizeBytes,
                render.NodesLoaded,
                render.NodesFailed,
                render.TimedOut,
                render.CreatedAt,
                ErrorMessage: null));
        }

        var job = await _jobRepository.GetByIdAsync(query.RenderId, cancellationToken);
        if (job is null || job.AssetType != "Scene" || job.SceneId is null)
        {
            return Result.Failure<SceneRenderView>(new Error(
                "SceneRender.NotFound", $"No scene render was requested with ID {query.RenderId}."));
        }

        return Result.Success(new SceneRenderView(
            job.Id,
            job.SceneId.Value,
            job.SceneViewpoint ?? "iso",
            Status: job.Status.ToString(),
            Width: null,
            Height: null,
            SizeBytes: null,
            NodesLoaded: null,
            NodesFailed: null,
            TimedOut: null,
            CreatedAt: job.CreatedAt,
            ErrorMessage: job.ErrorMessage));
    }
}

public record GetSceneRenderQuery(int RenderId) : IQuery<SceneRenderView>;

public record SceneRenderView(
    int RenderId,
    int SceneId,
    string Viewpoint,
    string Status,
    int? Width,
    int? Height,
    long? SizeBytes,
    int? NodesLoaded,
    int? NodesFailed,
    bool? TimedOut,
    DateTime CreatedAt,
    string? ErrorMessage);
