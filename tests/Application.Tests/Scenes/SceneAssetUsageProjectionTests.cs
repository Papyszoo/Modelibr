using Application.Scenes;
using Domain.Scenes;
using Xunit;

namespace Application.Tests.Scenes;

/// <summary>
/// The rows a scene document produces (prompt 13-C) - the index a project's derived asset list
/// and "which scenes use this model" both read.
/// </summary>
public class SceneAssetUsageProjectionTests
{
    private static SceneDocument DocumentOf(params SceneNode[] nodes) =>
        new(SceneDocument.CurrentSchemaVersion, nodes, Array.Empty<SceneLight>(), SceneEnvironment.Default);

    private static SceneNode Node(string id, int assetId, int? versionId = 9) =>
        new(id, SceneTransform.Identity, Asset: new SceneAssetRef(SceneAssetTypes.Model, assetId, versionId));

    /// <summary>
    /// The mistake the key exists to prevent: twelve chairs are twelve nodes carrying one asset
    /// id, and keying on the asset would collapse them and undercount what the scene uses.
    /// </summary>
    [Fact]
    public void TwelveNodesOfOneAsset_AreTwelveRows()
    {
        var nodes = Enumerable.Range(1, 12).Select(i => Node($"chair-{i}", 41)).ToArray();

        var rows = SceneAssetUsageProjection.From(3, DocumentOf(nodes));

        Assert.Equal(12, rows.Count);
        Assert.Equal(12, rows.Select(r => r.NodeId).Distinct().Count());
        Assert.All(rows, r => Assert.Equal(41, r.AssetId));
    }

    /// <summary>
    /// Scene references pin a version, so a project using two versions of one model has to be
    /// able to say so.
    /// </summary>
    [Fact]
    public void TheVersionIsOnTheRow()
    {
        var rows = SceneAssetUsageProjection.From(3, DocumentOf(
            Node("a", 41, versionId: 9),
            Node("b", 41, versionId: 10)));

        Assert.Equal(new int?[] { 9, 10 }, rows.Select(r => r.VersionId).ToList());
    }

    [Fact]
    public void ANodeThatReferencesNoAsset_ContributesNothing()
    {
        // A blockout primitive is not something a project can be said to use.
        var rows = SceneAssetUsageProjection.From(3, DocumentOf(
            new SceneNode("massing", SceneTransform.Identity, Primitive: new ScenePrimitive("box")),
            Node("chair", 41)));

        Assert.Single(rows);
        Assert.Equal("chair", rows[0].NodeId);
    }

    [Fact]
    public void AnEmptyScene_ProducesNoRows()
    {
        Assert.Empty(SceneAssetUsageProjection.From(3, DocumentOf()));
    }
}
