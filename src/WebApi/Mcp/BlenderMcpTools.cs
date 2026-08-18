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

    [McpServerTool(Name = "bake_textures")]
    [Description("Bake a model's own appearance and geometry into texture maps with Blender, imported as a texture set bound to it. " +
                 "maps: diffuse (base colour, lighting excluded), ao, normal, roughness, emissive, or combined (a lit render - do not bind one as base colour). " +
                 "Leave unwrap off to bake maps for the UV layout the model already has. Turn it ON for an atlas-packed model " +
                 "(search_assets(uvStatus:'atlas_packed') finds them): its UVs are a corner of a palette shared with hundreds of other models, so a fresh " +
                 "layout is generated, the current appearance is baked onto it, and a NEW inactive version is written around the result. " +
                 "unwrap needs a colour map, because the new layout invalidates the model's existing textures. " +
                 "Returns a job id: minutes of work, so collect the result with get_job_status. Requires Blender (Settings).")]
    public static Task<object> BakeTextures(
        ICommandHandler<RequestBlenderOperationCommand, BlenderOperationRequested> handler,
        IAgentAudit audit,
        McpCallerContext caller,
        [Description("Model id to bake.")] int modelId,
        [Description("Unique key so a retried call does not queue the bake twice.")] string idempotencyKey,
        [Description("Maps to bake. Defaults to diffuse and ao. diffuse and combined both become the set's Albedo, so ask for only one.")] string[]? maps = null,
        [Description("Version id to bake. Defaults to the model's active version.")] int? versionId = null,
        [Description("Generate a fresh UV layout and write a new version around the bake. Needed for atlas-packed models; requires a colour map.")] bool unwrap = false,
        [Description("Map size in pixels, a power of two from 128 to 4096. Default 1024. 4096 on heavy geometry can exhaust the worker.")] int? resolution = null,
        [Description("Cycles samples per pixel, 1-512, default 32. Raise it if AO looks grainy; it is the main cost driver.")] int? samples = null,
        [Description("Pixels the bake bleeds past each island edge, 0-64, default 16. Raise it if seams show at low mip levels.")] int? margin = null,
        [Description("Name for the resulting texture set. Defaults to the model's file name with '(baked)'.")] string? setName = null,
        [Description("Optional batch id. Writes sharing one can be undone together with reverse_operation.")] string? batchId = null,
        CancellationToken cancellationToken = default)
    {
        return Guarded(
            audit,
            caller,
            new AgentWrite(idempotencyKey, "bake-textures", "Model", modelId, batchId),
            async ct =>
            {
                var parameters = BakeParameters(maps, unwrap, resolution, samples, margin, setName);
                var result = await handler.Handle(
                    new RequestBlenderOperationCommand(
                        modelId, BlenderOperations.BakeTextures, versionId, parameters),
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
                            ? "This bake was already queued for this version; the same job id is returned rather than running it twice."
                            : "Queued. Collect the texture set id - and the new version id, if unwrap was on - with get_job_status once it finishes.",
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

    /// <summary>
    /// Same discipline as <see cref="Parameters"/>: send only what the caller actually chose,
    /// so every default is stated once, in the validator.
    /// </summary>
    private static string BakeParameters(
        string[]? maps, bool unwrap, int? resolution, int? samples, int? margin, string? setName)
    {
        var parameters = new Dictionary<string, object>();
        if (maps is { Length: > 0 }) parameters["maps"] = maps;
        if (unwrap) parameters["unwrap"] = true;
        if (resolution is { } size) parameters["resolution"] = size;
        if (samples is { } count) parameters["samples"] = count;
        if (margin is { } bleed) parameters["margin"] = bleed;
        if (!string.IsNullOrWhiteSpace(setName)) parameters["setName"] = setName.Trim();
        return System.Text.Json.JsonSerializer.Serialize(parameters);
    }
}
