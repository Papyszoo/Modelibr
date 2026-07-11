namespace Application.Abstractions.Services;

/// <summary>
/// Fire-and-forget scheduler for background (re)generation of a model version's cached
/// generated-{name}.blend WebDAV file (see <see cref="IBlendFileGenerator"/>). Callers
/// enqueue right after attaching a renderable file to a version, and after invalidating
/// the cache, so the file (re)appears in WebDAV listings without requiring a client GET to
/// trigger generation synchronously — closing the readiness-flap window where the model
/// version exists but generated-{name}.blend hasn't been produced yet.
/// </summary>
public interface IBlendFileGenerationQueue
{
    /// <summary>
    /// Schedules background generation for the given model version. Must never block or
    /// throw — implementations skip silently when Blender integration is unavailable or
    /// the queue is momentarily saturated; the GET-time fallback in
    /// <see cref="IBlendFileGenerator.GetOrGenerateAsync"/> still covers anything dropped.
    /// </summary>
    void Enqueue(int modelId, int versionId);
}
