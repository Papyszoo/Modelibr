using Domain.Models;

namespace Application.Abstractions.Repositories;

/// <summary>
/// One asset a project's scenes reference, folded across the scenes that reference it.
/// </summary>
/// <param name="Name">The asset's own name, or null when it no longer resolves - a scene can outlive a recycled asset.</param>
/// <param name="SceneNames">Which of the project's scenes use it. Named, not counted: "used in Living Room" is what a user needs to know before removing it.</param>
/// <param name="NodeCount">How many nodes across those scenes reference it. Twelve chairs are twelve nodes and one asset.</param>
public sealed record ProjectSceneAssetUsage(
    string AssetType,
    int AssetId,
    string? Name,
    IReadOnlyList<string> SceneNames,
    int NodeCount);

/// <param name="NodeCount">How many nodes in that scene reference the asset.</param>
public sealed record SceneUsingAsset(int SceneId, string SceneName, int? ProjectId, int NodeCount);

/// <summary>
/// The indexed projection of what scene documents reference (prompt 13-C): written by the one
/// point every scene write funnels through, read by the project's derived asset list and by
/// "which scenes stand on this model".
/// </summary>
public interface ISceneAssetUsageRepository
{
    /// <summary>
    /// Replaces one scene's rows with the ones its accepted document produces.
    /// </summary>
    /// <remarks>
    /// Delete-and-reinsert rather than a diff: the document is replaced outright by several
    /// writers, and a diff that missed one would leave the projection quietly stale. The write
    /// is not committed here - it rides the same transaction as the document that produced it,
    /// so the two can never disagree about what the scene contains.
    /// </remarks>
    Task ReplaceForSceneAsync(
        int sceneId, IReadOnlyList<SceneAssetUsage> rows, CancellationToken cancellationToken = default);

    /// <summary>Every asset referenced by the scenes of one project.</summary>
    Task<IReadOnlyList<ProjectSceneAssetUsage>> ForProjectAsync(
        int projectId, CancellationToken cancellationToken = default);

    /// <summary>Which scenes reference one asset. The question asked before deleting it.</summary>
    Task<IReadOnlyList<SceneUsingAsset>> ScenesUsingAsync(
        string assetType, int assetId, CancellationToken cancellationToken = default);
}
