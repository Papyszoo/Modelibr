using System.ComponentModel;
using Application.Abstractions.Messaging;
using Application.Projects.Profile;
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
                 "This is how to inspect a scene without a viewport; do not infer geometry from the document alone. " +
                 "When the scene belongs to a project, the response also carries that project's full brief under `project` - " +
                 "style, budget, world convention and guidance - so the constraints arrive with the scene rather than needing a second call.")]
    public static async Task<object> GetScene(
        IQueryHandler<GetSceneByIdQuery, SceneView> handler,
        IQueryHandler<GetProjectBriefQuery, ProjectBriefDto> projectHandler,
        [Description("Scene id.")] int sceneId,
        CancellationToken cancellationToken = default)
    {
        var result = await handler.Handle(new GetSceneByIdQuery(sceneId), cancellationToken);
        if (result.IsFailure)
        {
            return new { error = result.Error.Code, message = result.Error.Message };
        }

        // The brief rides along with the scene deliberately. An agent handed a scene id must
        // not have to know to go looking for the project - the one that does not know is
        // exactly the one that will place a photoscan into a low-poly game.
        var project = await BriefFor(projectHandler, result.Value.Scene.ProjectId, cancellationToken);

        return new { scene = result.Value, project };
    }

    /// <summary>
    /// The project brief for a scene, or null when it belongs to none. A failure to read it
    /// is reported as no brief rather than as a failed scene read: the scene is still
    /// answerable, and an agent that gets an error for the whole call learns nothing.
    /// </summary>
    private static async Task<ProjectBriefDto?> BriefFor(
        IQueryHandler<GetProjectBriefQuery, ProjectBriefDto> handler,
        int? projectId,
        CancellationToken cancellationToken)
    {
        if (projectId is not int id) return null;

        var brief = await handler.Handle(new GetProjectBriefQuery(id), cancellationToken);
        return brief.IsSuccess ? brief.Value : null;
    }

    [McpServerTool(Name = "get_slots")]
    [Description("List the decisions in a scene that are the user's to make, with every candidate proposed for each one - " +
                 "chosen, still open, and rejected. " +
                 "READ THIS BEFORE PROPOSING ANOTHER ROUND. Rejected candidates carry the reason they were ruled out, and a slot the " +
                 "user threw out wholesale carries their reason for that too ('none of these, they are all too modern'). " +
                 "Proposing again without reading them is how an agent re-offers the asset it was just turned down on. " +
                 "Each candidate reports what the library knows about it - dimensions in metres, part count, materials, quality flags, " +
                 "and any cameras or lights inside it - so a proposal can be judged on more than its own rationale. " +
                 "resolvedBy says whether a person or an agent settled each decision.")]
    public static async Task<object> GetSlots(
        IQueryHandler<GetSceneSlotsQuery, SceneSlotsView> handler,
        [Description("Scene id.")] int sceneId,
        CancellationToken cancellationToken = default)
    {
        var result = await handler.Handle(new GetSceneSlotsQuery(sceneId), cancellationToken);
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
