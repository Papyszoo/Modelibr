using SharedKernel;

namespace Application.Abstractions.Services;

/// <summary>
/// Commits a staged scene-document write, reporting a lost update as a failed
/// <see cref="Result"/> rather than throwing.
///
/// Why a service and not the trailing unit-of-work commit: a scene's revision is a database
/// concurrency token, so whether this write raced another one is only knowable at the UPDATE
/// itself. Comparing the revision in memory cannot see it - two writers both read revision N,
/// both pass the check, both write N+1, and the edit that landed first is gone with nothing
/// reported to anyone. Left to the decorator's commit, the database's verdict would surface
/// as an unhandled exception long after the handler returned success.
///
/// Why not on <c>ISceneRepository</c>: repositories stage mutations and never self-commit
/// (<c>RepositoriesDontSelfCommitTests</c> enforces it). This sits alongside
/// <c>ThumbnailQueue</c> - a service that commits its own writes because the commit itself
/// carries meaning. The decorator's later commit is then a no-op flush.
/// </summary>
public interface ISceneDocumentCommit
{
    Task<Result> SaveAsync(CancellationToken cancellationToken = default);
}
