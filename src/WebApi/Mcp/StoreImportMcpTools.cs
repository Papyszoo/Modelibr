using System.ComponentModel;
using Application.Abstractions.Messaging;
using Application.Agents;
using Application.StoreCatalog;
using Application.StoreImports;
using ModelContextProtocol.Server;
using static WebApi.Mcp.McpWriteGuard;

namespace WebApi.Mcp;

/// <summary>
/// Watching an import the agent started (v0.6 prompt 15, part C).
/// </summary>
/// <remarks>
/// A read, and registered with the reads. Store imports keep their own job table rather
/// than the operation-job table <c>get_job_status</c> polls, so they need their own poll -
/// pointing the agent at the wrong one would hand it a permanent "job not found".
/// </remarks>
[McpServerToolType]
public sealed class StoreImportReadMcpTools
{
    private static readonly TimeSpan MaxWait = TimeSpan.FromSeconds(120);
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(2);

    [McpServerTool(Name = "get_store_import")]
    [Description("Check a store import started by import_store_asset: its status, how many items were created, " +
                 "skipped or failed, and the local pack id once it has one. Pass waitSeconds to block instead of " +
                 "polling in a loop; you get the current status if the wait runs out and the import keeps running. " +
                 "This is NOT get_job_status - store imports have their own job ids.")]
    public static async Task<object> GetStoreImport(
        IQueryHandler<GetStoreImportJobQuery, StoreImportJobDto> handler,
        McpCallerContext caller,
        [Description("Store import job id, as returned by import_store_asset.")] int jobId,
        [Description("Seconds to wait for the import to finish before answering. 0 (the default) answers immediately. Capped at 120.")] int waitSeconds = 0,
        CancellationToken cancellationToken = default)
    {
        var denied = caller.Denied(McpScope.Read);
        if (denied is not null)
        {
            return denied;
        }

        var budget = TimeSpan.FromSeconds(Math.Clamp(waitSeconds, 0, MaxWait.TotalSeconds));
        var deadline = DateTime.UtcNow + budget;

        while (true)
        {
            var result = await handler.Handle(new GetStoreImportJobQuery(jobId), cancellationToken);
            if (result.IsFailure)
            {
                return new { error = result.Error.Code, message = result.Error.Message };
            }

            var view = result.Value;
            // Completed and Failed are both verdicts; waiting past either spends the budget
            // on an answer that will not change.
            if (view.Status is "Completed" or "Failed" || DateTime.UtcNow >= deadline)
            {
                return view;
            }

            await Task.Delay(PollInterval, cancellationToken);
        }
    }
}

/// <summary>
/// Acquiring a free asset from the companion Asset Store (v0.6 prompt 15, part C).
/// </summary>
/// <remarks>
/// The inversion worth stating plainly: <b>the agent can fetch a free asset by itself, but
/// never a paid one.</b> A free approved asset is anonymous at the store, so this tool needs
/// no credential at all. Anything else needs the user's store session to mint an asset-scoped
/// import token in the browser, which makes accepting it a UI action rather than a tool call.
/// The refusal here is therefore not a placeholder for a future tool - it is the design.
///
/// It is a write like any other: <c>MCP_WRITE_ENABLED</c>, an idempotency claim, an audit
/// row. What it does not do is return a finished import; the pack arrives in the background,
/// so the audit payload records the job, and <c>get_store_import</c> collects the outcome.
/// </remarks>
[McpServerToolType]
public sealed class StoreImportMcpTools
{
    [McpServerTool(Name = "import_store_asset")]
    [Description("Import a FREE asset from the companion Asset Store into this library. Free and approved is the " +
                 "only case an agent can acquire on its own: a paid asset is refused here and has to be accepted by " +
                 "the user while signed in to the store. Queues a background import and returns a job id - collect " +
                 "the outcome with get_store_import, not get_job_status. Import against a slot you are actually " +
                 "filling; this downloads files and writes a pack, so it is not a way to browse.")]
    public static Task<object> ImportStoreAsset(
        IQueryHandler<GetStoreAssetQuery, StoreCatalogAssetResponse> catalog,
        ICommandHandler<CreateStoreImportCommand, CreateStoreImportResponse> importHandler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Store asset id (a Guid, from a search_store_assets hit).")] string storeAssetId,
        [Description("Unique key so a retried call does not import the pack twice.")] string idempotencyKey,
        [Description("Optional store item ids to import instead of the whole pack, from get_store_asset's items.")] IReadOnlyList<string>? selectedItemIds = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "import-store-asset", "Pack", BatchId: batchId),
            async ct =>
            {
                // The store is the authority on who may fetch what, and it enforces this
                // rule itself on the anonymous manifest. Reading the catalog first is for
                // the agent's sake: "that asset costs $5" beats a background job that dies
                // on a 401 two seconds later.
                var detail = await catalog.Handle(new GetStoreAssetQuery(storeAssetId), ct);
                if (detail.IsFailure)
                {
                    return Failed(detail.Error);
                }

                var asset = detail.Value.Asset;
                if (asset.AlreadyImported)
                {
                    return Failed(new
                    {
                        error = "StoreImport.AlreadyImported",
                        message = $"'{asset.Title}' is already in this library. Search for it with search_assets " +
                                  "instead of importing it again."
                    });
                }

                if (!asset.IsFree)
                {
                    return Failed(new
                    {
                        error = "StoreImport.PaidAssetNeedsTheUser",
                        message = $"'{asset.Title}' costs {asset.Price} {asset.Currency ?? "USD"}. An agent cannot " +
                                  "acquire a paid asset. Propose it as a slot candidate and let the user accept it " +
                                  "while signed in to the store - their session is what mints the import token."
                    });
                }

                var result = await importHandler.Handle(
                    new CreateStoreImportCommand(
                        detail.Value.StoreUrl,
                        asset.StoreAssetId,
                        // No token on purpose: free and approved is anonymous at the store.
                        ImportToken: null,
                        selectedItemIds),
                    ct);

                if (result.IsFailure)
                {
                    return Failed(result.Error);
                }

                var response = new
                {
                    status = "queued",
                    jobId = result.Value.JobId,
                    storeAssetId = asset.StoreAssetId,
                    title = asset.Title,
                    itemsRequested = selectedItemIds?.Count ?? asset.ItemCount,
                    note = "Downloading in the background. Collect the pack id with get_store_import."
                };

                // No asset id yet - the pack is created by the background job, so the audit
                // row records the job that will create it rather than claiming a pack that
                // does not exist. Undo, when it is wanted, is a pack deletion afterwards.
                return Applied(response, "Pack", null, response);
            },
            cancellationToken);
    }
}
