using System.Text.Json;
using System.Text.Json.Nodes;
using Application.Extraction.Jobs;
using SharedKernel;

namespace Application.Blender;

/// <summary>
/// What each Blender operation costs and what it accepts.
/// </summary>
/// <remarks>
/// Parameters are validated here, at the point of asking, rather than in the Python script
/// that eventually reads them. A margin of -3 discovered inside Blender is a job that was
/// queued, claimed, run for a minute and dead-lettered; discovered here it is an immediate
/// message naming the bound it broke. The script still defends itself - it just should
/// never be the first thing to notice.
/// </remarks>
public static class BlenderOperationSpecs
{
    /// <summary>
    /// How long a claim is held before the queue assumes the worker died.
    /// Generous, because the failure it guards against - a second worker starting the same
    /// bake while the first is still running - wastes far more than a late retry does.
    /// </summary>
    public static int LeaseMinutes(string operation) => operation switch
    {
        BlenderOperations.BakeTextures => 45,
        BlenderOperations.ConvertFormat => 20,
        _ => 20
    };

    /// <summary>
    /// How many times the queue re-runs the operation before dead-lettering it.
    /// Two, not the queue's usual three: a Blender operation that fails on real geometry
    /// almost always fails the same way again, and each attempt costs minutes of CPU.
    /// </summary>
    public const int MaxAttempts = 2;

    /// <summary>
    /// Validates and normalises an operation's parameters into the JSON the worker receives.
    /// Returns "{}" for an operation that takes none.
    /// </summary>
    public static Result<string> NormalizeParameters(string operation, string? parametersJson)
    {
        JsonObject supplied;
        if (string.IsNullOrWhiteSpace(parametersJson))
        {
            supplied = new JsonObject();
        }
        else
        {
            try
            {
                supplied = JsonNode.Parse(parametersJson) as JsonObject
                    ?? throw new JsonException("Parameters must be a JSON object.");
            }
            catch (JsonException ex)
            {
                return Result.Failure<string>(new Error(
                    "Blender.InvalidParameters", $"Parameters are not a JSON object: {ex.Message}"));
            }
        }

        return operation switch
        {
            BlenderOperations.UvUnwrap => NormalizeUvUnwrap(supplied),
            _ => Result.Success(supplied.ToJsonString())
        };
    }

    /// <summary>
    /// Unwrap parameters, with Blender's own defaults where it has them.
    /// </summary>
    /// <remarks>
    /// <c>method</c> is the choice that matters: <c>smart</c> (smart UV project) cuts the
    /// mesh wherever the angle between faces exceeds the limit and is what an un-unwrapped
    /// game asset wants; <c>angle</c> (the classic angle-based unwrap) respects seams the
    /// author already marked, which is right for a model that has some and wrong for one
    /// that has none - it produces a single stretched island.
    ///
    /// <c>lightmap</c> writes a second UV channel instead of replacing the first, because a
    /// lightmap needs a non-overlapping layout that a texture map does not want.
    /// </remarks>
    private static Result<string> NormalizeUvUnwrap(JsonObject supplied)
    {
        var method = (supplied["method"]?.GetValue<string>() ?? "smart").Trim().ToLowerInvariant();
        if (method is not ("smart" or "angle"))
        {
            return Result.Failure<string>(new Error(
                "Blender.InvalidParameters",
                $"Unknown unwrap method '{method}'. Use 'smart' for a model with no seams, or 'angle' for one whose author marked them."));
        }

        var angleLimit = ReadDouble(supplied, "angleLimit", 66);
        if (angleLimit is not (>= 1 and <= 89))
        {
            return Result.Failure<string>(new Error(
                "Blender.InvalidParameters", "angleLimit must be a number between 1 and 89 degrees."));
        }

        var islandMargin = ReadDouble(supplied, "islandMargin", 0.02);
        if (islandMargin is not (>= 0 and <= 0.5))
        {
            return Result.Failure<string>(new Error(
                "Blender.InvalidParameters", "islandMargin must be a number between 0 and 0.5."));
        }

        var lightmap = supplied["lightmap"]?.GetValue<bool>() ?? false;

        var channelName = (supplied["channelName"]?.GetValue<string>()
            ?? (lightmap ? "UVLightmap" : "UVMap")).Trim();
        if (channelName.Length is 0 or > 63)
        {
            return Result.Failure<string>(new Error(
                "Blender.InvalidParameters", "channelName must be between 1 and 63 characters."));
        }

        return Result.Success(new JsonObject
        {
            ["method"] = method,
            ["angleLimit"] = angleLimit,
            ["islandMargin"] = islandMargin,
            ["lightmap"] = lightmap,
            ["channelName"] = channelName
        }.ToJsonString());
    }

    /// <summary>
    /// Reads a number, or NaN when the value is not one. NaN fails every range check
    /// above - which is why those are written as "not within", never as "outside": NaN
    /// compares false to both bounds, so an "outside" test would wave a string through.
    /// </summary>
    private static double ReadDouble(JsonObject o, string key, double fallback)
    {
        var node = o[key];
        if (node is null) return fallback;
        try { return node.GetValue<double>(); }
        catch (Exception) { return double.NaN; }
    }
}
