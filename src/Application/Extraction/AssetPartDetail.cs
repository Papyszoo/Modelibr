using System.Text.Json;

namespace Application.Extraction;

/// <summary>
/// Reads the worker-written per-part detail blob (<c>AssetPart.Detail</c>).
///
/// The column is free-form JSON on purpose - the worker adds fields ahead of the backend
/// knowing about them - so every read here is total: a missing field, a wrong shape or an
/// unparseable blob yields "nothing recorded", never an exception. A caller loses the detail
/// it asked about, not the whole read it was part of.
/// </summary>
public static class AssetPartDetail
{
    /// <summary>
    /// The part's authored material slot names, as extracted by the worker's scene-graph
    /// walk. These are the strings <c>apply_material</c>'s <c>slot</c> argument matches.
    /// </summary>
    public static IReadOnlyList<string> MaterialSlots(string? detail)
    {
        if (string.IsNullOrWhiteSpace(detail))
        {
            return Array.Empty<string>();
        }

        try
        {
            using var doc = JsonDocument.Parse(detail);
            if (doc.RootElement.ValueKind != JsonValueKind.Object ||
                !doc.RootElement.TryGetProperty("materialSlots", out var slots) ||
                slots.ValueKind != JsonValueKind.Array)
            {
                return Array.Empty<string>();
            }

            return slots.EnumerateArray()
                .Where(s => s.ValueKind == JsonValueKind.String)
                .Select(s => s.GetString() ?? string.Empty)
                .Where(s => s.Length > 0)
                .ToList();
        }
        catch (JsonException)
        {
            return Array.Empty<string>();
        }
    }

    /// <summary>
    /// The part's world-space bounding box, as the worker measured it while walking the
    /// scene graph.
    ///
    /// World rather than local on purpose: a sofa's cushion is only useful to a caller if it
    /// knows where the cushion is <b>in the asset</b>, and a local box plus a chain of parent
    /// transforms is a computation the caller would have to redo and could get wrong.
    /// </summary>
    public static AssetPartBounds? Bounds(string? detail)
    {
        if (string.IsNullOrWhiteSpace(detail))
        {
            return null;
        }

        try
        {
            using var doc = JsonDocument.Parse(detail);
            if (doc.RootElement.ValueKind != JsonValueKind.Object ||
                !doc.RootElement.TryGetProperty("worldBoundingBox", out var box) ||
                box.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            var min = Triple(box, "min");
            var max = Triple(box, "max");

            return min is null || max is null
                ? null
                : new AssetPartBounds(min, max, new[]
                {
                    max[0] - min[0],
                    max[1] - min[1],
                    max[2] - min[2],
                });
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static double[]? Triple(JsonElement box, string name)
    {
        if (!box.TryGetProperty(name, out var value) ||
            value.ValueKind != JsonValueKind.Array ||
            value.GetArrayLength() != 3)
        {
            return null;
        }

        var triple = new double[3];
        var index = 0;

        foreach (var component in value.EnumerateArray())
        {
            if (!component.TryGetDouble(out var number))
            {
                return null;
            }

            triple[index++] = number;
        }

        return triple;
    }
}

/// <summary>A part's world-space extent, in the asset's own coordinates.</summary>
public sealed record AssetPartBounds(
    IReadOnlyList<double> Min,
    IReadOnlyList<double> Max,
    IReadOnlyList<double> Dimensions);
