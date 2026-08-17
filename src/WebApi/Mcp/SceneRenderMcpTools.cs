using System.ComponentModel;
using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Scenes;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace WebApi.Mcp;

/// <summary>
/// Looking at a scene.
///
/// <c>get_scene</c> reports footprints and overlaps, which is enough to reason about
/// geometry but not enough to notice that a chair is facing a wall or that a material
/// reads as plastic. This is the tool that closes that loop: the agent sees what the user
/// would see, drawn by the same component the editor draws with.
/// </summary>
[McpServerToolType]
public sealed class SceneRenderMcpTools
{
    /// <summary>
    /// How long <c>render_scene</c> blocks before handing back an id instead of a picture.
    ///
    /// Long enough that an ordinary scene comes back in one round trip, short enough that
    /// a scene with fifty cold assets does not look like a hung tool. Past it the work is
    /// still running - the agent has lost nothing but the convenience.
    /// </summary>
    private static readonly TimeSpan WaitBudget = TimeSpan.FromSeconds(60);

    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(1);

    [McpServerTool(Name = "render_scene")]
    [Description("Draw a scene and look at it. Returns a picture of the scene from the given viewpoint, taken by the real editor " +
                 "so it shows exactly what a user would see. Use it to check work that geometry alone cannot confirm - facing, " +
                 "framing, materials, whether an asset actually loaded. Waits for the render; if it takes too long you get a " +
                 "renderId to collect later with get_scene_render. The reply also says how many nodes drew and how many failed: a " +
                 "gap in the picture is a failed node, not empty floor.")]
    public static async Task<CallToolResult> RenderScene(
        ICommandHandler<RequestSceneRenderCommand, RequestSceneRenderResponse> requestHandler,
        IQueryHandler<GetSceneRenderQuery, SceneRenderView> renderQueryHandler,
        ISceneRenderRepository renderRepository,
        [Description("Scene id.")] int sceneId,
        [Description("Camera angle: iso, front, side or top. Defaults to iso.")] string? viewpoint = null,
        CancellationToken cancellationToken = default)
    {
        var requested = await requestHandler.Handle(
            new RequestSceneRenderCommand(sceneId, viewpoint), cancellationToken);

        if (requested.IsFailure)
        {
            return Error(requested.Error.Code, requested.Error.Message);
        }

        var renderId = requested.Value.RenderId;
        var deadline = DateTime.UtcNow + WaitBudget;

        while (DateTime.UtcNow < deadline)
        {
            await Task.Delay(PollInterval, cancellationToken);

            var view = await renderQueryHandler.Handle(
                new GetSceneRenderQuery(renderId), cancellationToken);

            if (view.IsFailure)
            {
                return Error(view.Error.Code, view.Error.Message);
            }

            if (view.Value.Status == "Ready")
            {
                return await Picture(renderRepository, view.Value, cancellationToken);
            }

            // A job that died has nothing to wait for. Reporting it now beats spending the
            // rest of the budget on a render that is not coming.
            if (view.Value.Status is "Failed" or "Dead")
            {
                return Error(
                    "SceneRender.Failed",
                    $"Scene {sceneId} could not be rendered: {view.Value.ErrorMessage ?? "no reason given"}.");
            }
        }

        return Text(new
        {
            renderId,
            sceneId,
            viewpoint = requested.Value.Viewpoint,
            status = "Pending",
            message = $"Still drawing after {WaitBudget.TotalSeconds:0} seconds. Collect it with get_scene_render using renderId {renderId}."
        });
    }

    [McpServerTool(Name = "get_scene_render")]
    [Description("Collect a render that render_scene did not finish in time, by its renderId. Returns the picture once it is ready, " +
                 "or says it is still being drawn.")]
    public static async Task<CallToolResult> GetSceneRender(
        IQueryHandler<GetSceneRenderQuery, SceneRenderView> renderQueryHandler,
        ISceneRenderRepository renderRepository,
        [Description("The renderId render_scene handed back.")] int renderId,
        CancellationToken cancellationToken = default)
    {
        var view = await renderQueryHandler.Handle(
            new GetSceneRenderQuery(renderId), cancellationToken);

        if (view.IsFailure)
        {
            return Error(view.Error.Code, view.Error.Message);
        }

        if (view.Value.Status != "Ready")
        {
            return Text(new
            {
                renderId,
                view.Value.SceneId,
                view.Value.Viewpoint,
                status = view.Value.Status,
                view.Value.ErrorMessage
            });
        }

        return await Picture(renderRepository, view.Value, cancellationToken);
    }

    /// <summary>
    /// The picture, plus the counts that make it readable.
    ///
    /// Both are returned together on purpose: a render is taken even when a node never
    /// loaded, and nothing in the image distinguishes that hole from an empty patch of
    /// floor. Handing over the image alone would let an agent conclude a scene is fine
    /// when a third of it failed to draw.
    /// </summary>
    private static async Task<CallToolResult> Picture(
        ISceneRenderRepository renderRepository,
        SceneRenderView view,
        CancellationToken cancellationToken)
    {
        var render = await renderRepository.GetByJobIdAsync(view.RenderId, cancellationToken);
        if (render is null || !File.Exists(render.FilePath))
        {
            return Error(
                "SceneRender.FileMissing",
                $"Render {view.RenderId} was recorded but its image is not on disk.");
        }

        var bytes = await File.ReadAllBytesAsync(render.FilePath, cancellationToken);

        var summary = new
        {
            view.RenderId,
            view.SceneId,
            view.Viewpoint,
            view.Width,
            view.Height,
            view.NodesLoaded,
            view.NodesFailed,
            view.TimedOut,
            note = view.NodesFailed > 0
                ? $"{view.NodesFailed} node(s) failed to load - any gap you see in the picture is one of them, not empty space."
                : view.TimedOut == true
                    ? "The scene had not finished loading when this was taken, so it may be mid-load."
                    : null
        };

        return new CallToolResult
        {
            Content =
            [
                new ImageContentBlock
                {
                    // Raw bytes: the block base64-encodes them itself on the wire.
                    Data = bytes,
                    MimeType = "image/png"
                },
                new TextContentBlock { Text = JsonSerializer.Serialize(summary) }
            ]
        };
    }

    private static CallToolResult Text(object payload) => new()
    {
        Content = [new TextContentBlock { Text = JsonSerializer.Serialize(payload) }]
    };

    private static CallToolResult Error(string code, string message) => new()
    {
        IsError = true,
        Content = [new TextContentBlock { Text = JsonSerializer.Serialize(new { error = code, message }) }]
    };
}
