using System.ComponentModel;
using Application.Abstractions.Messaging;
using Application.Agents;
using Application.Scenes;
using ModelContextProtocol.Server;
using static WebApi.Mcp.McpWriteGuard;

namespace WebApi.Mcp;

/// <summary>
/// The one project-shaped write an agent needs: telling a scene which project it belongs to
/// (prompt 13-C/D1). Editing the profile itself is deliberately left to the user - it is a
/// statement about what is being made, not something an agent should infer and set.
/// </summary>
[McpServerToolType]
public sealed class ProjectWriteMcpTools
{
    [McpServerTool(Name = "set_scene_project")]
    [Description("Link a scene to a project so its brief applies, or pass projectId=null to unlink it. A scene write: it bumps the scene's revision and is undoable with reverse_operation.")]
    public static Task<object> SetSceneProject(
        ICommandHandler<SetSceneProjectCommand, SetSceneProjectResponse> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Scene id.")] int sceneId,
        [Description("Unique key so a retried call does not re-apply.")] string idempotencyKey,
        [Description("Project id to link to, or null to unlink.")] int? projectId = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "set-scene-project", "Scene", sceneId, BatchId: batchId),
            async ct =>
            {
                var result = await handler.Handle(new SetSceneProjectCommand(sceneId, projectId), ct);
                if (result.IsFailure)
                {
                    return Failed(result.Error);
                }

                return Applied(
                    new { status = "ok", scene = result.Value },
                    "Scene",
                    sceneId,
                    result.Value,
                    // The link being replaced is the whole of what this write destroys.
                    new { projectId = result.Value.PreviousProjectId });
            },
            cancellationToken);
    }
}
