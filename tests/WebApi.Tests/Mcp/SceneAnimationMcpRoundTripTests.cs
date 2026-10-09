using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Agents;
using Application.Projects.Profile;
using Application.Scenes;
using Domain.Scenes;
using Moq;
using SharedKernel;
using WebApi.Mcp;
using Xunit;

namespace WebApi.Tests.Mcp;

/// <summary>
/// The agent-facing round trip for the two per-node performance fields: a document written
/// through <c>update_scene_document</c> is read straight back through <c>get_scene</c>
/// carrying the same animation and shape keys.
///
/// The tools are thin pass-throughs, but this is the pair an agent actually composes, and
/// the JSON boundary between them is exactly where a field goes missing. The shape-key map
/// is asserted key-for-key because the document's key is the model's own morph-target name -
/// a camel-cased "squash" would match nothing and quietly do nothing.
/// </summary>
public class SceneAnimationMcpRoundTripTests
{
    private const string DocumentJson = """
        {"schemaVersion":1,"lights":[],"nodes":[
          {"id":"kid","name":"waving kid",
           "transform":{"position":{"x":1,"y":0,"z":2},"rotationEuler":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1}},
           "asset":{"assetType":"Model","assetId":42,"versionId":7},
           "animation":{"clip":"Wave","loop":false,"speed":1.5,"timeOffset":0.25},
           "shapeKeys":{"Squash":0.8,"Stretch":0.1}}]}
        """;

    [Fact]
    public async Task Update_Scene_Document_Then_Get_Scene_Returns_Animation_And_Shape_Keys_Unchanged()
    {
        var store = new InMemorySceneDocument();
        var read = new SceneDocumentReader(store);

        var updated = await SceneWriteMcpTools.UpdateSceneDocument(
            store, read, ClaimGranted().Object, McpCallerContext.Unauthenticated(),
            sceneId: 1, documentJson: DocumentJson, idempotencyKey: "round-trip-1");

        Assert.Contains("\"ok\"", Json(updated));

        // The write response itself carries the per-node views, so the fields it accepted
        // come straight back from the same call - not only from a later get_scene.
        using (var writeResponse = JsonDocument.Parse(Json(updated, camelCase: true)))
        {
            var written = writeResponse.RootElement.GetProperty("nodes")[0];
            Assert.Equal("Wave", written.GetProperty("animation").GetProperty("clip").GetString());
            Assert.Equal(0.8, written.GetProperty("shapeKeys").GetProperty("Squash").GetDouble());
        }

        // Immediately after the write, on the read path an agent would use. The project
        // handler is never reached - the scene carries no project id - but the tool needs one.
        var fetched = await SceneReadMcpTools.GetScene(
            read, new Mock<IQueryHandler<GetProjectBriefQuery, ProjectBriefDto>>().Object, sceneId: 1);

        using var response = JsonDocument.Parse(Json(fetched, camelCase: true));
        var node = response.RootElement.GetProperty("scene").GetProperty("nodes")[0];

        Assert.Equal("kid", node.GetProperty("nodeId").GetString());

        var animation = node.GetProperty("animation");
        Assert.Equal("Wave", animation.GetProperty("clip").GetString());
        Assert.False(animation.GetProperty("loop").GetBoolean());
        Assert.Equal(1.5, animation.GetProperty("speed").GetDouble());
        Assert.Equal(0.25, animation.GetProperty("timeOffset").GetDouble());

        var shapeKeys = node.GetProperty("shapeKeys");
        Assert.Equal(2, shapeKeys.EnumerateObject().Count());
        Assert.Equal(0.8, shapeKeys.GetProperty("Squash").GetDouble());
        Assert.Equal(0.1, shapeKeys.GetProperty("Stretch").GetDouble());
    }

    [Fact]
    public async Task Get_Scene_Leaves_Animation_And_Shape_Keys_Absent_When_The_Node_Carries_None()
    {
        // The backward-compatible half: a document written before these fields existed reads
        // back without them rather than as an empty object or a default animation.
        const string oldDocument = """
            {"schemaVersion":1,"lights":[],"nodes":[
              {"id":"lamp",
               "transform":{"position":{"x":0,"y":0,"z":0},"rotationEuler":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1}},
               "asset":{"assetType":"Model","assetId":1,"versionId":1}}]}
            """;

        var store = new InMemorySceneDocument();
        var read = new SceneDocumentReader(store);

        await SceneWriteMcpTools.UpdateSceneDocument(
            store, read, ClaimGranted().Object, McpCallerContext.Unauthenticated(),
            sceneId: 1, documentJson: oldDocument, idempotencyKey: "back-compat-1");

        var fetched = await SceneReadMcpTools.GetScene(
            read, new Mock<IQueryHandler<GetProjectBriefQuery, ProjectBriefDto>>().Object, sceneId: 1);

        using var response = JsonDocument.Parse(Json(fetched, camelCase: true));
        var node = response.RootElement.GetProperty("scene").GetProperty("nodes")[0];

        Assert.True(node.TryGetProperty("animation", out var animation));
        Assert.Equal(JsonValueKind.Null, animation.ValueKind);
        Assert.True(node.TryGetProperty("shapeKeys", out var shapeKeys));
        Assert.Equal(JsonValueKind.Null, shapeKeys.ValueKind);
    }

    private static string Json(object value, bool camelCase = false) =>
        JsonSerializer.Serialize(value, new JsonSerializerOptions
        {
            PropertyNamingPolicy = camelCase ? JsonNamingPolicy.CamelCase : null,
        });

    /// <summary>An audit whose claim always succeeds - the ordinary "key was free" case.</summary>
    private static Mock<IAgentAudit> ClaimGranted()
    {
        var audit = new Mock<IAgentAudit>();
        audit.Setup(a => a.TryBeginAsync(It.IsAny<AgentWrite>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AgentClaim(AgentClaimOutcome.Owned, null, "gen-1"));
        audit.Setup(a => a.CompleteAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int?>(),
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        audit.Setup(a => a.AbandonAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);
        return audit;
    }

    /// <summary>The in-memory document <c>update_scene_document</c> overwrites.</summary>
    private sealed class InMemorySceneDocument : ICommandHandler<UpdateSceneDocumentCommand, SceneView>
    {
        public SceneDocument Document { get; private set; } = SceneDocument.Empty();

        public Task<Result<SceneView>> Handle(UpdateSceneDocumentCommand command, CancellationToken cancellationToken)
        {
            var parsed = SceneDocumentCodec.Parse(command.DocumentJson);
            if (parsed.IsFailure)
            {
                return Task.FromResult(Result.Failure<SceneView>(parsed.Error));
            }

            Document = parsed.Value;
            return Task.FromResult(Result.Success(SceneViewOf(Document)));
        }
    }

    /// <summary>The read side <c>get_scene</c> reads from.</summary>
    private sealed class SceneDocumentReader : IQueryHandler<GetSceneByIdQuery, SceneView>
    {
        private readonly InMemorySceneDocument _store;

        public SceneDocumentReader(InMemorySceneDocument store) => _store = store;

        public Task<Result<SceneView>> Handle(GetSceneByIdQuery query, CancellationToken cancellationToken) =>
            Task.FromResult(Result.Success(SceneViewOf(_store.Document)));
    }

    private static SceneView SceneViewOf(SceneDocument document)
    {
        // No asset facts: this test is about the document fields surviving the round trip,
        // and a node whose bounds are unknown simply reports no footprint.
        var facts = new Dictionary<string, SceneAssetFacts>(StringComparer.Ordinal);

        return new SceneView(
            new SceneSummary(
                1, "Round trip", null, SceneDocument.CurrentSchemaVersion, 1,
                document.Nodes.Count, document.Lights.Count, DateTime.UtcNow, DateTime.UtcNow),
            document,
            document.Nodes.Select(node => SceneViewBuilder.Describe(node, facts)).ToList(),
            Array.Empty<SceneOverlap>(),
            Array.Empty<SceneScaleWarning>());
    }
}
