using Domain.Models;
using Domain.Scenes;

namespace Application.Scenes;

/// <summary>
/// Turns an accepted scene document into the rows that index what it references (prompt 13-C).
/// </summary>
/// <remarks>
/// Rebuilt wholesale per scene write rather than maintained incrementally: <c>SceneWriter</c>
/// is not the only path a document takes - <c>update_scene_document</c> and the editor's
/// <c>PUT /scenes/{id}/document</c> replace it outright - so delete-and-reinsert from the
/// accepted document at the one point every write funnels through is what stops the projection
/// drifting from exactly the path nobody tested.
/// </remarks>
public static class SceneAssetUsageProjection
{
    public static IReadOnlyList<SceneAssetUsage> From(int sceneId, SceneDocument document)
    {
        var rows = new List<SceneAssetUsage>();

        foreach (var node in document.Nodes)
        {
            if (node.Asset is null)
            {
                // A blockout primitive references no asset. Skipping it is the point: it is
                // not something a project can be said to use.
                continue;
            }

            rows.Add(SceneAssetUsage.Create(
                sceneId, node.Id, node.Asset.AssetType, node.Asset.AssetId, node.Asset.VersionId));
        }

        return rows;
    }
}
