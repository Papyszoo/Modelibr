using System.Text.Json;
using Application.Models;

namespace Application.Extraction.Derivation;

/// <summary>
/// Maps a scene-graph extraction (the raw import DTOs) into the pure
/// <see cref="DerivationAssetInput"/> the derive engine consumes. Per-part
/// dimensions come from the jsonb <c>worldBoundingBox</c> ({min,max} arrays) so
/// they reflect the node's world transform (scale/rotation) and agree with the
/// whole-asset <c>worldBounds</c>; the local <c>boundingBox</c> is a fallback for
/// payloads that predate it (extractor v1) or the bpy path. Fields the three.js
/// path doesn't populate (hidden/scale flags) default off and are filled by the
/// bpy path later.
/// </summary>
public static class SceneGraphDerivationMapper
{
    public static DerivationAssetInput ToDerivationInput(
        string? assetName,
        SceneGraphRollupsDto rollups,
        IReadOnlyList<SceneGraphPartDto> parts)
    {
        var partInputs = parts.Select(p => new DerivationPartInput(
            PartPath: p.PartPath,
            Name: p.Name,
            ParentPath: p.ParentPath,
            Depth: p.Depth,
            ObjectType: p.ObjectType,
            TriangleCount: p.TriangleCount,
            GeometryHash: p.GeometryHash,
            HasUvs: p.HasUvs,
            Dimensions: DimensionsFromDetail(p.Detail))).ToList();

        return new DerivationAssetInput(
            assetName,
            rollups?.WorldBounds?.Dimensions,
            partInputs,
            OriginInBounds: OriginInBounds(rollups, parts));
    }

    /// <summary>
    /// Where the asset's origin sits inside its world bounds, as a 0..1 fraction per axis.
    ///
    /// This was never computed, so every asset in the library derived
    /// <c>OriginConvention: null</c> and placement fell back to assuming a centred origin.
    /// The corpus is overwhelmingly base-at-origin, so every placed object floated by half
    /// its own height - and the footprint read back to verify it shared the assumption, so
    /// the check agreed with the broken scene.
    ///
    /// Prefers the rollup box the extractor already computes, falling back to the union of
    /// the parts' world boxes for a payload whose rollup carries no min/max (the bpy path).
    /// Both come from the same extraction, so they describe the same asset in the same space.
    ///
    /// This is deliberately **not** run against stored part rows later: a library extracted
    /// before `7f0c7c77` has the post-`normalizeModel` thumbnail framing box in those rows,
    /// and nothing at read time tells it apart from a real one. See the note in
    /// <c>SceneAssetFactsProvider.ResolveOneAsync</c>.
    /// </summary>
    private static IReadOnlyList<double>? OriginInBounds(
        SceneGraphRollupsDto? rollups,
        IReadOnlyList<SceneGraphPartDto> parts)
    {
        var bounds = rollups?.WorldBounds;
        var min = bounds?.Min;
        var max = bounds?.Max;

        if (min is not { Count: 3 } || max is not { Count: 3 })
        {
            (min, max) = UnionOfPartWorldBounds(parts.Select(p => p.Detail));
            if (min is null || max is null)
            {
                return null;
            }
        }

        return FractionOfBounds(min, max);
    }

    private static IReadOnlyList<double>? FractionOfBounds(IReadOnlyList<double> min, IReadOnlyList<double> max)
    {
        var fractions = new double[3];
        for (var axis = 0; axis < 3; axis++)
        {
            var extent = max[axis] - min[axis];
            if (!double.IsFinite(extent) || !double.IsFinite(min[axis]))
            {
                return null;
            }

            // A flat axis - a plane, a decal - has no inside for the origin to sit in. It
            // lies on that face, so the fraction is 0 rather than a division by zero.
            fractions[axis] = extent <= 0 ? 0 : Math.Clamp((0 - min[axis]) / extent, 0, 1);
        }

        return fractions;
    }

    private static (List<double>? Min, List<double>? Max) UnionOfPartWorldBounds(
        IEnumerable<JsonElement?> partDetails)
    {
        List<double>? min = null;
        List<double>? max = null;

        foreach (var partDetail in partDetails)
        {
            if (partDetail is not { ValueKind: JsonValueKind.Object } detail ||
                !TryGetObject(detail, "worldBoundingBox", out var box) ||
                !box.TryGetProperty("min", out var minElement) ||
                !box.TryGetProperty("max", out var maxElement))
            {
                continue;
            }

            var partMin = ReadTuple(minElement);
            var partMax = ReadTuple(maxElement);
            if (partMin is not { Count: 3 } || partMax is not { Count: 3 })
            {
                continue;
            }

            if (min is null || max is null)
            {
                (min, max) = (partMin, partMax);
                continue;
            }

            for (var axis = 0; axis < 3; axis++)
            {
                min[axis] = Math.Min(min[axis], partMin[axis]);
                max[axis] = Math.Max(max[axis], partMax[axis]);
            }
        }

        return (min, max);
    }

    private static IReadOnlyList<double>? DimensionsFromDetail(JsonElement? detail)
    {
        if (detail is not { ValueKind: JsonValueKind.Object } element)
        {
            return null;
        }
        // Prefer world-space bounds (reflect the node transform); fall back to the
        // local geometry box for extractor-v1 / bpy payloads that lack it.
        if (!TryGetObject(element, "worldBoundingBox", out var bb) &&
            !TryGetObject(element, "boundingBox", out bb))
        {
            return null;
        }
        if (!bb.TryGetProperty("min", out var min) || !bb.TryGetProperty("max", out var max))
        {
            return null;
        }

        var minV = ReadTuple(min);
        var maxV = ReadTuple(max);
        if (minV is null || maxV is null || minV.Count != 3 || maxV.Count != 3)
        {
            return null;
        }

        return new[]
        {
            Math.Abs(maxV[0] - minV[0]),
            Math.Abs(maxV[1] - minV[1]),
            Math.Abs(maxV[2] - minV[2]),
        };
    }

    private static bool TryGetObject(JsonElement parent, string name, out JsonElement value)
    {
        if (parent.TryGetProperty(name, out value) && value.ValueKind == JsonValueKind.Object)
        {
            return true;
        }
        value = default;
        return false;
    }

    private static List<double>? ReadTuple(JsonElement array)
    {
        if (array.ValueKind != JsonValueKind.Array)
        {
            return null;
        }
        var values = new List<double>();
        foreach (var item in array.EnumerateArray())
        {
            if (item.ValueKind == JsonValueKind.Number && item.TryGetDouble(out var d))
            {
                values.Add(d);
            }
            else
            {
                return null;
            }
        }
        return values;
    }
}
