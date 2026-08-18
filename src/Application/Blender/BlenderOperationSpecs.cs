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
            BlenderOperations.BakeTextures => NormalizeBakeTextures(supplied),
            BlenderOperations.MeshAnalysis => NormalizeMeshAnalysis(supplied),
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
    /// The maps a bake can produce, and the texture type each becomes in the resulting set.
    /// </summary>
    /// <remarks>
    /// <c>diffuse</c> and <c>combined</c> both land on Albedo, and a texture set holds one
    /// texture per type - so asking for both is rejected here rather than discovered when the
    /// second upload displaces the first. They are also different things: <c>diffuse</c> is
    /// colour with the lighting excluded, <c>combined</c> is a lit render. Binding a lit
    /// render as a base-colour map lights the model twice.
    /// </remarks>
    private static readonly Dictionary<string, string> BakeMaps = new(StringComparer.Ordinal)
    {
        ["diffuse"] = "Albedo",
        ["combined"] = "Albedo",
        ["ao"] = "AO",
        ["normal"] = "Normal",
        ["roughness"] = "Roughness",
        ["emissive"] = "Emissive"
    };

    /// <summary>The maps that carry the model's colour, one of which a re-layout needs.</summary>
    private static readonly string[] ColorMaps = ["diffuse", "combined"];

    /// <summary>
    /// Bake parameters.
    /// </summary>
    /// <remarks>
    /// <c>unwrap</c> is the parameter that decides what the operation even is. Left off, the
    /// bake writes maps for the layout the model already has and produces a texture set and
    /// nothing else. Turned on, it lays out a fresh non-overlapping UV set, bakes the model's
    /// current appearance onto it, and writes a NEW model version around the result - which
    /// is the only way to give one of the 775 atlas-packed assets its own textures, because
    /// their existing layout is a 3% corner of a palette shared with 700 other models.
    ///
    /// Turning it on therefore requires a colour map: the new layout invalidates every source
    /// texture, so without something to rebuild the material from the operation would report
    /// success and hand back a grey model.
    /// </remarks>
    private static Result<string> NormalizeBakeTextures(JsonObject supplied)
    {
        var requested = new List<string>();
        if (supplied["maps"] is JsonArray array)
        {
            foreach (var node in array)
            {
                var name = node?.GetValue<string>()?.Trim().ToLowerInvariant();
                if (!string.IsNullOrEmpty(name) && !requested.Contains(name))
                {
                    requested.Add(name);
                }
            }
        }

        if (requested.Count == 0)
        {
            requested.AddRange(["diffuse", "ao"]);
        }

        var unknown = requested.Where(m => !BakeMaps.ContainsKey(m)).ToList();
        if (unknown.Count > 0)
        {
            return Result.Failure<string>(new Error(
                "Blender.InvalidParameters",
                $"Unknown map(s) {string.Join(", ", unknown)}. Known maps: {string.Join(", ", BakeMaps.Keys.Order())}."));
        }

        var collisions = requested
            .GroupBy(m => BakeMaps[m])
            .Where(g => g.Count() > 1)
            .ToList();
        if (collisions.Count > 0)
        {
            var clash = collisions[0];
            return Result.Failure<string>(new Error(
                "Blender.InvalidParameters",
                $"{string.Join(" and ", clash)} both become the set's {clash.Key} texture, and a texture set holds one of each. Ask for one of them."));
        }

        var resolution = (int)ReadDouble(supplied, "resolution", 1024);
        if (resolution is not (>= 128 and <= 4096) || (resolution & (resolution - 1)) != 0)
        {
            return Result.Failure<string>(new Error(
                "Blender.InvalidParameters",
                "resolution must be a power of two between 128 and 4096."));
        }

        var samples = (int)ReadDouble(supplied, "samples", 32);
        if (samples is not (>= 1 and <= 512))
        {
            return Result.Failure<string>(new Error(
                "Blender.InvalidParameters", "samples must be a whole number between 1 and 512."));
        }

        var margin = (int)ReadDouble(supplied, "margin", 16);
        if (margin is not (>= 0 and <= 64))
        {
            return Result.Failure<string>(new Error(
                "Blender.InvalidParameters", "margin must be a whole number of pixels between 0 and 64."));
        }

        var unwrap = supplied["unwrap"]?.GetValue<bool>() ?? false;
        if (unwrap && !requested.Any(ColorMaps.Contains))
        {
            return Result.Failure<string>(new Error(
                "Blender.InvalidParameters",
                "Baking onto a generated UV layout needs a colour map to rebuild the material from, " +
                "because the new layout invalidates the model's existing textures. " +
                "Add 'diffuse' to maps, or leave unwrap off to bake onto the layout the model already has."));
        }

        var islandMargin = ReadDouble(supplied, "islandMargin", 0.02);
        if (islandMargin is not (>= 0 and <= 0.5))
        {
            return Result.Failure<string>(new Error(
                "Blender.InvalidParameters", "islandMargin must be a number between 0 and 0.5."));
        }

        var angleLimit = ReadDouble(supplied, "angleLimit", 66);
        if (angleLimit is not (>= 1 and <= 89))
        {
            return Result.Failure<string>(new Error(
                "Blender.InvalidParameters", "angleLimit must be a number between 1 and 89 degrees."));
        }

        var setName = supplied["setName"]?.GetValue<string>()?.Trim();
        if (setName is { Length: > 200 })
        {
            return Result.Failure<string>(new Error(
                "Blender.InvalidParameters", "setName must be 200 characters or fewer."));
        }

        var maps = new JsonArray();
        foreach (var map in requested)
        {
            maps.Add(map);
        }

        var normalized = new JsonObject
        {
            ["maps"] = maps,
            ["resolution"] = resolution,
            ["samples"] = samples,
            ["margin"] = margin,
            ["unwrap"] = unwrap,
            ["islandMargin"] = islandMargin,
            ["angleLimit"] = angleLimit
        };
        if (!string.IsNullOrEmpty(setName))
        {
            normalized["setName"] = setName;
        }

        return Result.Success(normalized.ToJsonString());
    }

    /// <summary>
    /// Mesh-analysis parameters.
    /// </summary>
    /// <remarks>
    /// <c>overlapSamples</c> is the resolution of the grid UV overlap is measured on. It is
    /// the only knob because it is the only cost: overlap is measured by rasterising rather
    /// than by testing every triangle pair, which on a 60k-triangle asset is the difference
    /// between seconds and hours. The error is bounded by one cell - 0.2% of the square at
    /// the default 512.
    /// </remarks>
    private static Result<string> NormalizeMeshAnalysis(JsonObject supplied)
    {
        var overlapSamples = (int)ReadDouble(supplied, "overlapSamples", 512);
        if (overlapSamples is not (>= 64 and <= 2048))
        {
            return Result.Failure<string>(new Error(
                "Blender.InvalidParameters",
                "overlapSamples must be a whole number between 64 and 2048."));
        }

        return Result.Success(new JsonObject
        {
            ["overlapSamples"] = overlapSamples
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
