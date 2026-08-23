namespace Domain.Models;

/// <summary>
/// One node in one scene, and the asset it references - the indexable projection of what a
/// scene document points at (prompt 13-C).
/// </summary>
/// <remarks>
/// <para>
/// It exists because a project's asset list is <b>derived</b>: the project's assets are its
/// explicit members plus whatever its scenes reference. Answering that by parsing every
/// scene document per project read is a full scan, and a scene read that looked fine at ten
/// nodes did not survive twenty-one.
/// </para>
///
/// <para>
/// <b>The key is the node, not the asset.</b> Twelve chairs are twelve rows carrying one asset
/// id; keying on (SceneId, AssetId) would silently collapse them and make "used in" counts
/// wrong. <b>The version is on the row</b> because scene references pin a version - a project
/// using two versions of one model has to be able to say so.
/// </para>
///
/// <para>
/// The table is named for what it records rather than after the document's own
/// <c>SceneAssetRef</c> value type, which already owns that name. Two <c>SceneAssetRef</c>s
/// meaning different things is the confusion this projection exists to remove.
/// </para>
/// </remarks>
public class SceneAssetUsage
{
    public int SceneId { get; private set; }

    /// <summary>The node's id within the scene document. Half of the key.</summary>
    public string NodeId { get; private set; } = string.Empty;

    public string AssetType { get; private set; } = string.Empty;

    public int AssetId { get; private set; }

    /// <summary>The version the node pinned, or null for a family that carries none.</summary>
    public int? VersionId { get; private set; }

    public Scene Scene { get; private set; } = null!;

    public static SceneAssetUsage Create(
        int sceneId, string nodeId, string assetType, int assetId, int? versionId)
    {
        if (string.IsNullOrWhiteSpace(nodeId))
            throw new ArgumentException("A usage row needs the node it came from.", nameof(nodeId));
        if (string.IsNullOrWhiteSpace(assetType))
            throw new ArgumentException("A usage row needs an asset type.", nameof(assetType));
        if (assetId <= 0)
            throw new ArgumentException("Asset id must be greater than 0.", nameof(assetId));

        return new SceneAssetUsage
        {
            SceneId = sceneId,
            NodeId = nodeId.Trim(),
            AssetType = assetType.Trim(),
            AssetId = assetId,
            VersionId = versionId,
        };
    }
}
