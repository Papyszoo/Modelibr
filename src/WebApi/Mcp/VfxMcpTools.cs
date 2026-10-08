using System.ComponentModel;
using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Agents;
using Application.Vfx;
using ModelContextProtocol.Server;
using static WebApi.Mcp.McpWriteGuard;

namespace WebApi.Mcp;

/// <summary>
/// Visual effects over MCP.
///
/// The read half is always registered; <c>create_vfx</c> and <c>update_vfx</c> are write
/// tools and appear only when writes are enabled, like every other write surface.
///
/// Why an agent needs this: an effect is a small authored document that references
/// library meshes, sounds and sprites on a timeline. Building one is exactly the kind of
/// assembly work an agent is good at, and the server validates the whole document so a
/// mistyped field comes back with its path rather than a broken effect.
/// </summary>
[McpServerToolType]
public sealed class VfxReadMcpTools
{
    [McpServerTool(Name = "list_vfx")]
    [Description("Browse the visual effects in the library. Each hit carries its duration, component count and component types " +
                 "so an agent can pick an effect without opening it. Read one in full with get_vfx.")]
    public static async Task<object> ListVfx(
        IQueryHandler<GetVfxListQuery, IReadOnlyList<VfxSummaryDto>> handler,
        McpCallerContext caller,
        CancellationToken cancellationToken = default)
    {
        var denied = caller.Denied(McpScope.Read);
        if (denied is not null)
        {
            return denied;
        }

        var result = await handler.Handle(new GetVfxListQuery(), cancellationToken);

        return result.IsFailure
            ? new { error = result.Error.Code, message = result.Error.Message }
            : new { effects = result.Value };
    }

    [McpServerTool(Name = "get_vfx")]
    [Description("Read one visual effect in full: its name, description and v1 definition parsed as a JSON object " +
                 "(version, duration, loop, components), so the timeline can be inspected exactly as it is stored.")]
    public static async Task<object> GetVfx(
        IQueryHandler<GetVfxQuery, VfxDetailDto> handler,
        McpCallerContext caller,
        [Description("Vfx id.")] int vfxId,
        CancellationToken cancellationToken = default)
    {
        var denied = caller.Denied(McpScope.Read);
        if (denied is not null)
        {
            return denied;
        }

        var result = await handler.Handle(new GetVfxQuery(vfxId), cancellationToken);

        return result.IsFailure
            ? new { error = result.Error.Code, message = result.Error.Message }
            : result.Value;
    }
}

[McpServerToolType]
public sealed class VfxWriteMcpTools
{
    [McpServerTool(Name = "create_vfx")]
    [Description("Create a v1 visual effect. Definition (camelCase): {version:1, duration: 0.1-60 s, loop: bool, " +
                 "components: 0-32}. Each component: id (lowercase [a-z0-9-_], <=40, unique), type particles|mesh|light|sound, " +
                 "name <=100, start >=0, duration >0 with start+duration <= effect duration, optional position [x,y,z]. " +
                 "Required block by type - particles: {mode continuous|burst, rate 0-2000 (required in 'continuous' mode, " +
                 "optional otherwise), count 1-5000 (required in 'burst' mode, optional otherwise), lifetime (0,10], " +
                 "speed >=0, spread 0-180, gravity, sizeStart/sizeEnd >=0, colorStart/colorEnd #rrggbb, opacityStart/opacityEnd 0-1, " +
                 "blending additive|normal, spriteId?, seed int}; mesh: {modelId, versionId (optional; omitted or null is resolved " +
                 "to the model's active version)}; light: {color #rrggbb, range >0}; " +
                 "sound: {soundId, volume 0-1}. Optional tracks: mesh scale/opacity/rotationY, light intensity, each [[time,value],...] " +
                 "relative to the component start; no other track is allowed. modelId/versionId/soundId/spriteId must exist. " +
                 "An invalid definition is rejected whole and every problem is returned at once with the path of the field it is about. " +
                 "Omit definition for a default empty effect.")]
    public static Task<object> CreateVfx(
        ICommandHandler<CreateVfxCommand, VfxWriteOutcome> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Effect name.")] string name,
        [Description("Unique key so a retried call does not create twice.")] string idempotencyKey,
        [Description("Optional description.")] string? description = null,
        [Description("Optional v1 definition as a JSON object. Omitted or null starts from a default effect.")] JsonElement? definition = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "create-vfx", "Vfx", BatchId: batchId),
            async ct =>
            {
                var result = await handler.Handle(new CreateVfxCommand(name, description, definition), ct);
                if (result.IsFailure)
                    return Failed(result.Error);

                var outcome = result.Value;
                if (!outcome.IsValid)
                    return Failed(InvalidDefinition(outcome.Problems));

                return Applied(
                    new { status = "ok", vfxId = outcome.Vfx!.Id, name = outcome.Vfx.Name },
                    "Vfx", outcome.Vfx.Id, outcome.Vfx);
            },
            cancellationToken);
    }

    [McpServerTool(Name = "update_vfx")]
    [Description("Change a visual effect. Omitted fields are left alone. A supplied definition REPLACES the whole definition " +
                 "rather than merging it - a timeline is edited as a unit. The definition uses the same v1 contract as create_vfx " +
                 "(component types, required blocks per type, allowed tracks, start+duration <= effect duration, referenced asset ids " +
                 "must exist). Particles require rate in 'continuous' mode and count in 'burst' mode, the other may be omitted; a mesh " +
                 "versionId omitted or null is resolved to the model's active version. Every validation problem is returned at once " +
                 "with its path.")]
    public static Task<object> UpdateVfx(
        ICommandHandler<UpdateVfxCommand, VfxWriteOutcome> handler,
        IQueryHandler<GetVfxQuery, VfxDetailDto> getHandler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Vfx id.")] int vfxId,
        [Description("Unique key so a retried call does not apply twice.")] string idempotencyKey,
        [Description("New name.")] string? name = null,
        [Description("New description.")] string? description = null,
        [Description("Replacement v1 definition as a JSON object. Replaces the whole definition.")] JsonElement? definition = null,
        [Description("Optional batch id.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "update-vfx", "Vfx", vfxId, BatchId: batchId),
            async ct =>
            {
                // Read the effect first: it is what reverse_operation restores, and a
                // replacement that does not record what it replaced cannot be undone.
                var before = await getHandler.Handle(new GetVfxQuery(vfxId), ct);
                if (before.IsFailure)
                    return Failed(before.Error);

                var result = await handler.Handle(
                    new UpdateVfxCommand(vfxId, name, description, definition), ct);
                if (result.IsFailure)
                    return Failed(result.Error);

                var outcome = result.Value;
                if (!outcome.IsValid)
                    return Failed(InvalidDefinition(outcome.Problems));

                return Applied(
                    new { status = "ok", vfx = outcome.Vfx },
                    "Vfx", vfxId, outcome.Vfx!, before.Value);
            },
            cancellationToken);
    }

    private static object InvalidDefinition(IReadOnlyList<VfxProblem> problems) => new
    {
        error = "InvalidVfxDefinition",
        message = $"The vfx definition was rejected ({problems.Count} problem{(problems.Count == 1 ? "" : "s")}).",
        problems,
    };
}
