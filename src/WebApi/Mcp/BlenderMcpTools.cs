using System.ComponentModel;
using Application.Abstractions.Messaging;
using Application.Agents;
using Application.Blender;
using Application.Extraction.Jobs;
using ModelContextProtocol.Server;
using static WebApi.Mcp.McpWriteGuard;

namespace WebApi.Mcp;

/// <summary>
/// Polling. The half of every asynchronous tool that makes the other half usable.
/// </summary>
/// <remarks>
/// A read, and registered as one: it reports on a job someone else asked for and changes
/// nothing. Without it an agent that queues an unwrap has a number and no way to turn it
/// back into an answer - it would have to guess how long to sleep and then re-search the
/// library hoping to spot a new version.
/// </remarks>
[McpServerToolType]
public sealed class OperationJobReadMcpTools
{
    /// <summary>
    /// The longest <c>get_job_status</c> will hold the call open waiting for a verdict.
    /// Long enough that an unwrap usually finishes inside one call, short enough that the
    /// caller is not left wondering whether the tool itself hung.
    /// </summary>
    private static readonly TimeSpan MaxWait = TimeSpan.FromSeconds(120);

    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(2);

    [McpServerTool(Name = "get_job_status")]
    [Description("Check a queued job - a Blender operation (generate_uvs) or a re-derive. Returns its status, and once it has finished, " +
                 "what it produced: the new version id an unwrap wrote, the texture set a bake imported. " +
                 "Pass waitSeconds to block until it finishes instead of polling in a loop; you get the current status if the wait runs out, " +
                 "and the job keeps running either way.")]
    public static async Task<object> GetJobStatus(
        IQueryHandler<GetOperationJobQuery, OperationJobView> handler,
        McpCallerContext caller,
        [Description("Job id, as returned by generate_uvs or trigger_rederive.")] int jobId,
        [Description("Seconds to wait for the job to finish before answering. 0 (the default) answers immediately. Capped at 120.")] int waitSeconds = 0,
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
            var result = await handler.Handle(new GetOperationJobQuery(jobId), cancellationToken);
            if (result.IsFailure)
            {
                return new { error = result.Error.Code, message = result.Error.Message };
            }

            var view = result.Value;
            // Done and Dead are both verdicts. Waiting past a dead job would spend the whole
            // budget on an answer that is not going to change.
            if (view.Status is "Done" or "Dead" || DateTime.UtcNow >= deadline)
            {
                return view;
            }

            await Task.Delay(PollInterval, cancellationToken);
        }
    }
}

/// <summary>
/// Running Blender on a library asset.
/// </summary>
/// <remarks>
/// A write, and gated with the writes: an unwrap adds a version to a model. It is also the
/// first tool here that hands back a job id rather than a result, because the work takes
/// longer than a tool call should - collect it with <c>get_job_status</c>.
/// </remarks>
[McpServerToolType]
public sealed class BlenderWriteMcpTools
{
    [McpServerTool(Name = "generate_uvs")]
    [Description("Generate a UV layout for a model with Blender, written as a NEW version - the original file is never touched. " +
                 "Do this when a model has no UVs and you want to dress it with a tiling texture set; validate_scene reports which nodes need it, " +
                 "and search hits carry the same flag. If you only need a colour and a roughness, apply a parameter material instead - it needs no UVs and no unwrap. " +
                 "Returns a job id: the work is queued, so collect the result with get_job_status. " +
                 "Requires Blender to be installed (Settings); you get told so immediately if it is not.")]
    public static Task<object> GenerateUvs(
        ICommandHandler<RequestBlenderOperationCommand, BlenderOperationRequested> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Model id to unwrap.")] int modelId,
        [Description("Unique key so a retried call does not queue the unwrap twice.")] string idempotencyKey,
        [Description("Version id to unwrap. Defaults to the model's active version.")] int? versionId = null,
        [Description("'smart' (default) for a model with no seams, 'angle' for one whose author marked them.")] string? method = null,
        [Description("Angle in degrees above which smart-project cuts a new island. 1-89, default 66.")] double? angleLimit = null,
        [Description("Gap between islands, 0-0.5, default 0.02. Raise it if baked maps bleed between islands.")] double? islandMargin = null,
        [Description("Write a second, non-overlapping UV channel for lightmaps instead of replacing the first.")] bool lightmap = false,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "generate-uvs", "Model", modelId, batchId),
            async ct =>
            {
                var parameters = Parameters(method, angleLimit, islandMargin, lightmap);
                var result = await handler.Handle(
                    new RequestBlenderOperationCommand(
                        modelId, BlenderOperations.UvUnwrap, versionId, parameters),
                    ct);

                if (result.IsFailure)
                {
                    return Failed(result.Error);
                }

                var queued = result.Value;
                return Applied(
                    new
                    {
                        status = queued.AlreadyQueued ? "already-queued" : "queued",
                        jobId = queued.JobId,
                        modelId = queued.ModelId,
                        versionId = queued.VersionId,
                        note = queued.AlreadyQueued
                            ? "This unwrap was already queued for this version; the same job id is returned rather than running it twice."
                            : "Queued. Collect the new version id with get_job_status once it finishes.",
                    },
                    "Model", queued.ModelId, queued);
            },
            cancellationToken);
    }

    /// <summary>
    /// Builds the parameter object from the tool's named arguments, omitting anything the
    /// caller left alone so the defaults live in one place - the validator - rather than
    /// being restated here where they would drift.
    /// </summary>
    private static string Parameters(string? method, double? angleLimit, double? islandMargin, bool lightmap)
    {
        var parameters = new Dictionary<string, object>();
        if (!string.IsNullOrWhiteSpace(method)) parameters["method"] = method.Trim();
        if (angleLimit is { } angle) parameters["angleLimit"] = angle;
        if (islandMargin is { } margin) parameters["islandMargin"] = margin;
        if (lightmap) parameters["lightmap"] = true;
        return System.Text.Json.JsonSerializer.Serialize(parameters);
    }
}
