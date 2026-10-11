using System.Text.Json;

namespace Application.Models;

/// <summary>
/// The clip, shape-key and unbaked-rig metadata inside a model's raw extraction payload.
///
/// <para>
/// Two payload shapes carry it, written by two different commands, and both are read
/// here: the flat technical-metadata payload with top-level <c>animations</c> and
/// <c>shapeKeys</c> (<see cref="UpdateTechnicalMetadataCommand"/>), and the verbatim
/// scene-graph payload with <c>rollups.animations</c> plus <c>rollups.unbakedRig</c> and
/// each part's <c>detail.shapeKeys</c> (<c>ImportModelSceneGraphCommand</c> - which owns
/// the raw row whenever it runs, so its shape is the usual one).
/// </para>
///
/// <para>
/// Property casing differs between the two writers, so lookups are case-insensitive;
/// a missing field or an unparseable blob yields empty lists, never an exception -
/// the same total-read rule the per-part detail reader follows.
/// </para>
/// </summary>
internal sealed record ModelAnimationMetadata(
    IReadOnlyList<ModelAnimationDto> Animations,
    IReadOnlyList<ModelShapeKeysDto> ShapeKeys,
    ModelUnbakedRigDto? UnbakedRig)
{
    public static readonly ModelAnimationMetadata Empty = new(
        Array.Empty<ModelAnimationDto>(),
        Array.Empty<ModelShapeKeysDto>(),
        null);

    /// <summary>
    /// Reads the clip/shape-key metadata out of a raw extraction payload, whichever
    /// writer produced it. Never throws.
    /// </summary>
    public static ModelAnimationMetadata Parse(string? rawPayload)
    {
        if (string.IsNullOrWhiteSpace(rawPayload))
        {
            return Empty;
        }

        try
        {
            using var document = JsonDocument.Parse(rawPayload);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                return Empty;
            }

            var animations = ReadAnimations(Property(root, "animations"));
            if (animations.Count == 0 && Property(root, "rollups") is { } rollupsElement)
            {
                animations = ReadAnimations(Property(rollupsElement, "animations"));
            }

            var shapeKeys = ReadFlatShapeKeys(Property(root, "shapeKeys"));
            if (shapeKeys.Count == 0 && Property(root, "parts") is { } partsElement)
            {
                shapeKeys = ReadPartShapeKeys(partsElement);
            }

            // The unbaked-rig counts ride inside the scene-graph payload's rollups;
            // a flat payload would carry them at the top level, so read both.
            JsonElement? rigElement = null;
            if (Property(root, "rollups") is { } rigRollups)
            {
                rigElement = Property(rigRollups, "unbakedRig");
            }
            rigElement ??= Property(root, "unbakedRig");

            return new ModelAnimationMetadata(animations, shapeKeys, ReadUnbakedRig(rigElement));
        }
        catch (JsonException)
        {
            return Empty;
        }
    }

    private static IReadOnlyList<ModelAnimationDto> ReadAnimations(JsonElement? element)
    {
        if (element is null || element.Value.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<ModelAnimationDto>();
        }

        var result = new List<ModelAnimationDto>();
        foreach (var item in element.Value.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            var name = StringValue(item, "name");
            if (string.IsNullOrWhiteSpace(name))
            {
                continue;
            }

            result.Add(new ModelAnimationDto
            {
                Name = name.Trim(),
                DurationSeconds = NumberValue(item, "durationSeconds") ?? 0,
                Kinds = StringArray(item, "kinds"),
            });
        }

        return result;
    }

    /// <summary>The flat payload's `shapeKeys`: `[{meshName, shapeKeys: [names]}]`.</summary>
    private static IReadOnlyList<ModelShapeKeysDto> ReadFlatShapeKeys(JsonElement? element)
    {
        if (element is null || element.Value.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<ModelShapeKeysDto>();
        }

        var result = new List<ModelShapeKeysDto>();
        foreach (var item in element.Value.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            var meshName = StringValue(item, "meshName");
            if (string.IsNullOrWhiteSpace(meshName))
            {
                continue;
            }

            // `names` is the exposed spelling; accepting it too keeps the reader
            // total if a payload ever stores the read shape.
            var names = StringArray(item, "shapeKeys");
            if (names.Count == 0)
            {
                names = StringArray(item, "names");
            }
            if (names.Count == 0)
            {
                continue;
            }

            result.Add(new ModelShapeKeysDto
            {
                MeshName = meshName.Trim(),
                Names = names,
            });
        }

        return result;
    }

    /// <summary>The scene-graph payload's parts: mesh name + `detail.shapeKeys`.</summary>
    private static IReadOnlyList<ModelShapeKeysDto> ReadPartShapeKeys(JsonElement parts)    {
        if (parts.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<ModelShapeKeysDto>();
        }

        var result = new List<ModelShapeKeysDto>();
        foreach (var part in parts.EnumerateArray())
        {
            if (part.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            var detail = Property(part, "detail");
            if (detail is null)
            {
                continue;
            }

            var names = StringArray(detail.Value, "shapeKeys");
            if (names.Count == 0)
            {
                continue;
            }

            result.Add(new ModelShapeKeysDto
            {
                MeshName = WhiteSpaceToEmpty(StringValue(part, "name")),
                Names = names,
            });
        }

        return result;
    }

    /// <summary>
    /// The scene-graph payload's `rollups.unbakedRig` (or a flat payload's
    /// `unbakedRig`): counts of the rig features a plain web conversion cannot
    /// carry. Null when absent, of the wrong kind, or when nothing it reports
    /// would need a bake - a payload with every count at zero is "no warning",
    /// not an object with zeroes.
    /// </summary>
    private static ModelUnbakedRigDto? ReadUnbakedRig(JsonElement? element)
    {
        if (element is null || element.Value.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        var rig = element.Value;
        var dto = new ModelUnbakedRigDto
        {
            ObjectConstraints = IntValue(rig, "objectConstraints") ?? 0,
            BoneConstraints = IntValue(rig, "boneConstraints") ?? 0,
            IkConstraints = IntValue(rig, "ikConstraints") ?? 0,
            ObjectDrivers = IntValue(rig, "objectDrivers") ?? 0,
            ArmatureDrivers = IntValue(rig, "armatureDrivers") ?? 0,
            ShapeKeyDrivers = IntValue(rig, "shapeKeyDrivers") ?? 0,
            ShapeKeyActions = IntValue(rig, "shapeKeyActions") ?? 0,
            DroppedModifiers = StringArray(rig, "droppedModifiers"),
        };

        var hasFeatures = BoolValue(rig, "hasRigFeatures") == true
            || dto.ObjectConstraints > 0
            || dto.BoneConstraints > 0
            || dto.ObjectDrivers > 0
            || dto.ArmatureDrivers > 0
            || dto.ShapeKeyDrivers > 0
            || dto.ShapeKeyActions > 0
            || dto.DroppedModifiers.Count > 0;

        return hasFeatures ? dto with { HasRigFeatures = true } : null;
    }

    private static string WhiteSpaceToEmpty(string? value) =>
        string.IsNullOrWhiteSpace(value) ? string.Empty : value.Trim();

    /// <summary>Case-insensitive property lookup; null when absent or not an object.</summary>
    private static JsonElement? Property(JsonElement element, string name)
    {
        if (element.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        foreach (var property in element.EnumerateObject())
        {
            if (string.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase))
            {
                return property.Value;
            }
        }

        return null;
    }

    private static string? StringValue(JsonElement element, string name)
    {
        var value = Property(element, name);
        return value is { ValueKind: JsonValueKind.String } text ? text.GetString() : null;
    }

    private static double? NumberValue(JsonElement element, string name)
    {
        var value = Property(element, name);
        return value is { } number && number.TryGetDouble(out var parsed) ? parsed : null;
    }

    private static int? IntValue(JsonElement element, string name)
    {
        var value = Property(element, name);
        return value is { } number && number.TryGetInt32(out var parsed) ? parsed : null;
    }

    private static bool? BoolValue(JsonElement element, string name)
    {
        var value = Property(element, name);
        if (value is not { } flag)
        {
            return null;
        }

        return flag.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            _ => null,
        };
    }

    private static List<string> StringArray(JsonElement element, string name)
    {
        var value = Property(element, name);
        if (value is null || value.Value.ValueKind != JsonValueKind.Array)
        {
            return new List<string>();
        }

        return value.Value.EnumerateArray()
            .Where(item => item.ValueKind == JsonValueKind.String)
            .Select(item => item.GetString() ?? string.Empty)
            .Where(item => item.Length > 0)
            .ToList();
    }
}
