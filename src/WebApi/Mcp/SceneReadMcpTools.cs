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

    [McpServerTool(Name = "validate_scene")]
    [Description("Check a scene for the mistakes its own numbers cannot show you: things resting on nothing, geometry below the floor, " +
                 "an asset that is a whole sample scene rather than the prop it was placed as, nodes tilted or upside down, " +
                 "a scene with no key light, objects buried inside each other, and implausible scale. " +
                 "Returns a verdict, findings with stable codes, and - just as important - what it could NOT check: " +
                 "footprints are axis-aligned boxes, so nothing here can see that a wall is facing the wrong way. " +
                 "Run it after each stage of building, and still finish by calling render_scene and looking at the picture.")]
    public static async Task<object> ValidateScene(
        IQueryHandler<ValidateSceneQuery, SceneValidationView> handler,
        [Description("Scene id.")] int sceneId,
        CancellationToken cancellationToken = default)
    {
        var result = await handler.Handle(new ValidateSceneQuery(sceneId), cancellationToken);
        return result.IsFailure
            ? new { error = result.Error.Code, message = result.Error.Message }
            : result.Value;
    }
}
