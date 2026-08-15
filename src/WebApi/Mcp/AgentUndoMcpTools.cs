using System.ComponentModel;
using Application.Abstractions.Messaging;
using Application.Agents;
using Application.EnvironmentMaps;
using Application.Models;
using Application.RecycledFiles;
using Application.Sounds;
using Application.Sprites;
using Application.TextureSets;
using ModelContextProtocol.Server;
using static WebApi.Mcp.McpWriteGuard;

namespace WebApi.Mcp;

/// <summary>
/// The undo half of the agent write surface: reverse a write or a whole batch, recycle an
/// asset, and put a recycled one back.
///
/// Why these are separated from the other write tools: they are the only tools that can
/// destroy work an agent (or a person) did. They require the <c>destructive</c> scope on
/// top of <c>write</c>, the two that delete anything are also gated by
/// <c>MCP_DESTRUCTIVE_ENABLED</c>, and every one of them offers a dry run that reports
/// exactly what would happen without doing it.
///
/// Deleting is always a <b>soft</b> delete - the asset lands in the recycle bin the UI
/// already exposes, so an agent's mistake costs a click rather than a re-import.
/// </summary>
[McpServerToolType]
public sealed class AgentUndoMcpTools
{
    private const string DestructiveFlag = "MCP_DESTRUCTIVE_ENABLED";

    [McpServerTool(Name = "reverse_operation")]
    [Description("Undo one agent write by its idempotencyKey, or every write in a batch by its batchId. Pass exactly one. Defaults to a dry run that reports what WOULD be undone - pass dryRun=false to apply it.")]
    public static async Task<object> ReverseOperation(
        IAgentOperationReverser reverser,
        McpCallerContext caller,
        IConfiguration configuration,
        [Description("The idempotencyKey of a single write to undo.")] string? idempotencyKey = null,
        [Description("The batchId whose writes should all be undone, newest first.")] string? batchId = null,
        [Description("True (default) reports the plan without changing anything. Pass false to actually reverse.")] bool dryRun = true,
        CancellationToken cancellationToken = default)
    {
        var planned = await reverser.PlanAsync(idempotencyKey, batchId, cancellationToken);
        if (planned.IsFailure)
        {
            return new { error = planned.Error.Code, message = planned.Error.Message };
        }

        var plan = planned.Value;
        if (plan.IsEmpty)
        {
            return new
            {
                status = "nothing-to-do",
                message = "Every matching operation was already reversed, or never completed.",
            };
        }

        var steps = plan.Steps.Select(s => new
        {
            idempotencyKey = s.IdempotencyKey,
            operation = s.Operation,
            assetType = s.AssetType,
            assetId = s.AssetId,
            effect = s.Description,
            destructive = s.IsDestructive,
            reversible = s.IsSupported,
        }).ToArray();

        if (dryRun)
        {
            return new
            {
                status = "dry-run",
                wouldReverse = steps,
                destructive = plan.IsDestructive,
                message = plan.IsDestructive
                    ? "Some of these steps delete assets. Re-run with dryRun=false to apply."
                    : "Re-run with dryRun=false to apply.",
            };
        }

        // The scope is checked against the plan, not the tool: undoing a set of tags
        // restores a value, while undoing an import recycles an asset. Only the second
        // needs the destructive scope, and demanding it for both would push operators
        // toward handing out a scope they do not need.
        var required = plan.IsDestructive ? McpScope.Destructive : McpScope.Write;
        var denied = caller.Denied(required);
        if (denied is not null)
        {
            return denied;
        }

        if (plan.IsDestructive && !DestructiveEnabled(configuration))
        {
            return DestructiveDisabled("Reversing these operations would delete assets");
        }

        var applied = await reverser.ApplyAsync(plan, cancellationToken);
        if (applied.IsFailure)
        {
            return new { error = applied.Error.Code, message = applied.Error.Message };
        }

        var results = applied.Value;
        var reversed = results.Count(r => r.Reversed);

        return new
        {
            status = reversed == results.Count ? "reversed" : "partially-reversed",
            reversed,
            total = results.Count,
            steps = results.Select(r => new
            {
                idempotencyKey = r.IdempotencyKey,
                operation = r.Operation,
                reversed = r.Reversed,
                detail = r.Detail,
            }).ToArray(),
        };
    }

    [McpServerTool(Name = "delete_asset")]
    [Description("Recycle an asset (soft delete - it goes to the recycle bin and can be restored). assetType: Model, Sound, Sprite, EnvironmentMap or TextureSet. Defaults to a dry run; pass dryRun=false to apply.")]
    public static Task<object> DeleteAsset(
        IAgentAudit audit,
        McpCallerContext caller,
        IConfiguration configuration,
        IServiceProvider services,
        [Description("Model, Sound, Sprite, EnvironmentMap or TextureSet.")] string assetType,
        [Description("Id of the asset to recycle.")] int assetId,
        [Description("Unique key so a retried call does not re-apply.")] string idempotencyKey,
        [Description("True (default) reports what would be deleted without deleting it.")] bool dryRun = true,
        [Description("Optional batch id, so a group of deletions can be reversed together.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        if (!IsKnownAssetType(assetType))
        {
            return Task.FromResult<object>(UnknownAssetType(assetType));
        }

        if (dryRun)
        {
            return Task.FromResult<object>(new
            {
                status = "dry-run",
                wouldDelete = new { assetType, assetId },
                message = $"Would recycle {assetType} {assetId}. It would remain restorable with restore_asset. Re-run with dryRun=false to apply.",
            });
        }

        if (!DestructiveEnabled(configuration))
        {
            return Task.FromResult<object>(DestructiveDisabled("Deleting assets"));
        }

        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "delete-asset", assetType, assetId, BatchId: batchId),
            async ct =>
            {
                var result = await SoftDelete(services, assetType, assetId, ct);
                return result.IsFailure
                    ? Failed(result.Error)
                    : Applied(
                        new { status = "ok", assetType, assetId, recycled = true },
                        assetType, assetId,
                        new { assetType, assetId },
                        // The prior state is "not deleted", which restore_asset (and this
                        // entry's own reversal) is enough to express.
                        new { wasDeleted = false });
            },
            cancellationToken,
            McpScope.Destructive);
    }

    [McpServerTool(Name = "restore_asset")]
    [Description("Restore a recycled asset from the recycle bin. assetType: Model, Sound, Sprite, EnvironmentMap or TextureSet.")]
    public static Task<object> RestoreAsset(
        ICommandHandler<RestoreEntityCommand, RestoreEntityResponse> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Model, Sound, Sprite, EnvironmentMap or TextureSet.")] string assetType,
        [Description("Id of the asset to restore.")] int assetId,
        [Description("Unique key so a retried call does not re-apply.")] string idempotencyKey,
        [Description("Optional batch id, grouping this with related writes.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        if (!IsKnownAssetType(assetType))
        {
            return Task.FromResult<object>(UnknownAssetType(assetType));
        }

        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "restore-asset", assetType, assetId, BatchId: batchId),
            async ct =>
            {
                // RestoreEntityCommand takes the entity type the recycle bin uses, which is
                // the asset-family name lowercased - no separate vocabulary to keep in sync.
                var result = await handler.Handle(
                    new RestoreEntityCommand(assetType.ToLowerInvariant(), assetId), ct);

                return result.IsFailure
                    ? Failed(result.Error)
                    : Applied(
                        new { status = "ok", assetType, assetId, restored = true },
                        assetType, assetId, new { assetType, assetId });
            },
            cancellationToken);
    }

    /// <summary>
    /// Resolves and runs the right soft-delete command for a family. The handlers are pulled
    /// from the container rather than injected into the tool because a tool signature with
    /// five delete handlers on it is one every family added later has to widen.
    /// </summary>
    private static async Task<SharedKernel.Result> SoftDelete(
        IServiceProvider services, string assetType, int assetId, CancellationToken cancellationToken)
    {
        switch (assetType.ToLowerInvariant())
        {
            case "model":
                return await services
                    .GetRequiredService<ICommandHandler<SoftDeleteModelCommand, SoftDeleteModelResponse>>()
                    .Handle(new SoftDeleteModelCommand(assetId), cancellationToken);

            case "sound":
                return await services
                    .GetRequiredService<ICommandHandler<SoftDeleteSoundCommand>>()
                    .Handle(new SoftDeleteSoundCommand(assetId), cancellationToken);

            case "sprite":
                return await services
                    .GetRequiredService<ICommandHandler<SoftDeleteSpriteCommand>>()
                    .Handle(new SoftDeleteSpriteCommand(assetId), cancellationToken);

            case "environmentmap":
                return await services
                    .GetRequiredService<ICommandHandler<SoftDeleteEnvironmentMapCommand>>()
                    .Handle(new SoftDeleteEnvironmentMapCommand(assetId), cancellationToken);

            case "textureset":
                return await services
                    .GetRequiredService<ICommandHandler<SoftDeleteTextureSetCommand, SoftDeleteTextureSetResponse>>()
                    .Handle(new SoftDeleteTextureSetCommand(assetId), cancellationToken);

            default:
                return SharedKernel.Result.Failure(new SharedKernel.Error(
                    "UnknownAssetType", $"'{assetType}' cannot be deleted through MCP."));
        }
    }

    private static readonly string[] DeletableAssetTypes =
        ["Model", "Sound", "Sprite", "EnvironmentMap", "TextureSet"];

    private static bool IsKnownAssetType(string assetType) =>
        DeletableAssetTypes.Contains(assetType, StringComparer.OrdinalIgnoreCase);

    private static object UnknownAssetType(string assetType) => new
    {
        error = "UnknownAssetType",
        message = $"'{assetType}' is not an asset family this tool can act on.",
        validValues = DeletableAssetTypes,
    };

    private static bool DestructiveEnabled(IConfiguration configuration) =>
        configuration[DestructiveFlag] == "true";

    private static object DestructiveDisabled(string what) => new
    {
        error = "DestructiveDisabled",
        message = $"{what}, and {DestructiveFlag} is not enabled on this server.",
        remedy = $"Ask the operator to set {DestructiveFlag}=true and restart the Web API. Until then, dry runs still work.",
    };
}
