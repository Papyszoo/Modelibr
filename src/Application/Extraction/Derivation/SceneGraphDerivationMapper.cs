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
            partInputs);
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
