using System.ComponentModel;
using Application.Abstractions.Messaging;
using Application.Scenes;
using ModelContextProtocol.Server;

namespace WebApi.Mcp;

/// <summary>
/// Reading scenes. Always registered alongside the other read tools - an agent that can
/// search the library can look at what it has already built.
/// </summary>
[McpServerToolType]
public sealed class SceneReadMcpTools
{
    [McpServerTool(Name = "list_scenes")]
    [Description("List saved scenes with their node and light counts, newest edit first.")]
    public static async Task<object> ListScenes(
        IQueryHandler<GetAllScenesQuery, GetAllScenesResponse> handler,
        CancellationToken cancellationToken = default)
    {
        var result = await handler.Handle(new GetAllScenesQuery(), cancellationToken);
        return result.IsFailure
            ? new { error = result.Error.Code, message = result.Error.Message }
            : new { scenes = result.Value.Scenes };
    }

    [McpServerTool(Name = "get_scene")]
    [Description("Get a scene: its document, and per node the world footprint (AABB after transform), the source asset's own dimensions, " +
                 "its origin convention and how far it sits off the ground - plus every overlapping node pair and scale warning in the scene. " +
                 "This is how to inspect a scene without a viewport; do not infer geometry from the document alone.")]
    public static async Task<object> GetScene(
        IQueryHandler<GetSceneByIdQuery, SceneView> handler,
        [Description("Scene id.")] int sceneId,
        CancellationToken cancellationToken = default)
    {
        var result = await handler.Handle(new GetSceneByIdQuery(sceneId), cancellationToken);
        return result.IsFailure
            ? new { error = result.Error.Code, message = result.Error.Message }
            : result.Value;
    }
}
