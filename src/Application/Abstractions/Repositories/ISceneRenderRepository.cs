using Domain.Models;

namespace Application.Abstractions.Repositories;

public interface ISceneRenderRepository
{
    Task AddAsync(SceneRender render, CancellationToken cancellationToken = default);

    /// <summary>
    /// The render produced by a given job. This is the polling lookup: an agent handed a
    /// renderId when the wait expired comes back with exactly this.
    /// </summary>
    Task<SceneRender?> GetByJobIdAsync(int thumbnailJobId, CancellationToken cancellationToken = default);

    /// <summary>
    /// The newest render of a scene, whatever viewpoint it was taken from.
    /// </summary>
    Task<SceneRender?> GetLatestForSceneAsync(int sceneId, CancellationToken cancellationToken = default);
}
