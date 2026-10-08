using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Application.Vfx;

/// <summary>One validation problem: the path of the field and what is wrong with it.</summary>
public sealed record VfxProblem(string Path, string Message);

/// <summary>Which library family a component references.</summary>
public enum VfxAssetKind
{
    Model,
    ModelVersion,
    Sound,
    Sprite
}

/// <summary>A reference a component makes into the library, with the path that named it.</summary>
public sealed record VfxAssetReference(string Path, VfxAssetKind Kind, int Id);

/// <summary>The definition as read from a caller, plus every problem found in it.</summary>
public sealed record VfxDefinitionRead(JsonElement Definition, IReadOnlyList<VfxProblem> Problems)
{
    public bool IsValid => Problems.Count == 0;
}

/// <summary>
/// A definition with every mesh pinned to a concrete version, plus any problem that
/// prevented pinning.
/// </summary>
public sealed record VfxMeshVersionResolution(JsonElement Definition, IReadOnlyList<VfxProblem> Problems);

/// <summary>The list-view shape derived from a stored definition.</summary>
public sealed record VfxDefinitionSummary(double Duration, int ComponentCount, IReadOnlyList<string> ComponentTypes)
{
    public static readonly VfxDefinitionSummary Empty = new(0, 0, []);
}

/// <summary>
/// The v1 visual-effect definition contract: parsing, structural validation and the
/// reference extraction the command handlers use to check library ids.
///
/// Validation returns EVERY problem, each naming the full path of the field it is
/// about (<c>components[2].particles.rate</c>), because an agent that has to resubmit
/// once per typo burns a turn per typo. The reference-existence checks live in the
/// command handlers - they need repositories, which this pure contract deliberately
/// does not know about.
/// </summary>
public static class VfxDefinition
{
    public const int Version = 1;
    public const int MaxComponents = 32;
    public const double MinDuration = 0.1;
    public const double MaxDuration = 60.0;
    public const int MaxComponentIdLength = 40;
    public const int MaxComponentNameLength = 100;

    /// <summary>What a create with no definition gets: a valid one-second-twice effect.</summary>
    public const string DefaultJson = """{"version":1,"duration":2,"loop":false,"components":[]}""";

    private const string Particles = "particles";
    private static readonly string[] ComponentTypes = [Particles, "mesh", "light", "sound"];
    private static readonly string[] MeshTracks = ["scale", "opacity", "rotationY"];
    private static readonly string[] LightTracks = ["intensity"];

    private static readonly Regex ComponentIdPattern = new("^[a-z0-9-_]+$", RegexOptions.Compiled);
    private static readonly Regex HexColorPattern = new("^#[0-9a-fA-F]{6}$", RegexOptions.Compiled);

    /// <summary>
    /// Reads a caller-supplied definition and validates its structure. A missing
    /// definition becomes the default. A JSON string is parsed, so an MCP client that
    /// cannot express an object still reaches the same contract.
    /// </summary>
    public static VfxDefinitionRead Read(JsonElement? input)
    {
        var problems = new List<VfxProblem>();

        JsonElement definition;
        if (input is null || input.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            definition = Parse(DefaultJson);
        }
        else if (input.Value.ValueKind == JsonValueKind.String)
        {
            if (!TryParse(input.Value.GetString(), out definition))
            {
                problems.Add(new VfxProblem("definition", "must be a JSON object."));
                return new VfxDefinitionRead(default, problems);
            }
        }
        else if (input.Value.ValueKind == JsonValueKind.Object)
        {
            definition = input.Value;
        }
        else
        {
            problems.Add(new VfxProblem("definition", "must be a JSON object."));
            return new VfxDefinitionRead(default, problems);
        }

        if (definition.ValueKind != JsonValueKind.Object)
        {
            problems.Add(new VfxProblem("definition", "must be a JSON object."));
            return new VfxDefinitionRead(default, problems);
        }

        ValidateStructure(definition, problems);
        return new VfxDefinitionRead(definition, problems);
    }

    /// <summary>Validates an already-materialised definition element.</summary>
    public static IReadOnlyList<VfxProblem> Validate(JsonElement definition)
    {
        var problems = new List<VfxProblem>();
        if (definition.ValueKind != JsonValueKind.Object)
        {
            problems.Add(new VfxProblem("definition", "must be a JSON object."));
            return problems;
        }

        ValidateStructure(definition, problems);
        return problems;
    }

    /// <summary>Compact camelCase JSON, the form the column stores.</summary>
    public static string Serialize(JsonElement definition) => JsonSerializer.Serialize(definition);

    /// <summary>Parses a stored definition; malformed stored JSON yields an empty summary.</summary>
    public static VfxDefinitionSummary Summarize(string? definitionJson)
    {
        if (string.IsNullOrWhiteSpace(definitionJson)
            || !TryParse(definitionJson, out var definition)
            || definition.ValueKind != JsonValueKind.Object)
        {
            return VfxDefinitionSummary.Empty;
        }

        var duration = definition.TryGetProperty("duration", out var durationElement)
                       && durationElement.ValueKind == JsonValueKind.Number
                       && durationElement.TryGetDouble(out var parsedDuration)
            ? parsedDuration
            : 0;

        var componentCount = 0;
        var types = new List<string>();
        if (definition.TryGetProperty("components", out var components)
            && components.ValueKind == JsonValueKind.Array)
        {
            componentCount = components.GetArrayLength();
            foreach (var component in components.EnumerateArray())
            {
                if (component.ValueKind == JsonValueKind.Object
                    && component.TryGetProperty("type", out var type)
                    && type.ValueKind == JsonValueKind.String)
                {
                    var name = type.GetString()!;
                    if (!types.Contains(name, StringComparer.Ordinal))
                        types.Add(name);
                }
            }
        }

        return new VfxDefinitionSummary(duration, componentCount, types);
    }

    /// <summary>
    /// The library ids a structurally-valid definition names. A reference that cannot be
    /// read is skipped: the structural validation has already reported it.
    /// </summary>
    public static IReadOnlyList<VfxAssetReference> ExtractReferences(JsonElement definition)
    {
        var references = new List<VfxAssetReference>();
        if (definition.ValueKind != JsonValueKind.Object
            || !definition.TryGetProperty("components", out var components)
            || components.ValueKind != JsonValueKind.Array)
        {
            return references;
        }

        var index = 0;
        foreach (var component in components.EnumerateArray())
        {
            var componentPath = $"components[{index}]";
            if (component.ValueKind == JsonValueKind.Object
                && component.TryGetProperty("type", out var type)
                && type.ValueKind == JsonValueKind.String)
            {
                switch (type.GetString())
                {
                    case Particles when TryBlock(component, Particles, out var particles):
                        if (TryIntProperty(particles, "spriteId", out var spriteId))
                            references.Add(new VfxAssetReference(
                                $"{componentPath}.particles.spriteId", VfxAssetKind.Sprite, spriteId));
                        break;

                    case "mesh" when TryBlock(component, "mesh", out var mesh):
                        if (TryIntProperty(mesh, "modelId", out var modelId))
                            references.Add(new VfxAssetReference(
                                $"{componentPath}.mesh.modelId", VfxAssetKind.Model, modelId));
                        if (TryIntProperty(mesh, "versionId", out var versionId))
                            references.Add(new VfxAssetReference(
                                $"{componentPath}.mesh.versionId", VfxAssetKind.ModelVersion, versionId));
                        break;

                    case "sound" when TryBlock(component, "sound", out var sound):
                        if (TryIntProperty(sound, "soundId", out var soundId))
                            references.Add(new VfxAssetReference(
                                $"{componentPath}.sound.soundId", VfxAssetKind.Sound, soundId));
                        break;
                }
            }

            index++;
        }

        return references;
    }

    /// <summary>
    /// Pins every mesh component to a concrete version: a mesh that names no version takes
    /// the model's active one, so every saved mesh resolves to exactly one version later.
    /// A model with no active version is a problem at the mesh's versionId path. A model id
    /// absent from the lookup is left alone - the reference check already reported it.
    /// </summary>
    public static VfxMeshVersionResolution ResolveMeshVersions(
        JsonElement definition,
        IReadOnlyDictionary<int, int?> activeVersionIdByModelId)
    {
        var problems = new List<VfxProblem>();
        if (definition.ValueKind != JsonValueKind.Object
            || !definition.TryGetProperty("components", out var components)
            || components.ValueKind != JsonValueKind.Array)
        {
            return new VfxMeshVersionResolution(definition, problems);
        }

        JsonObject? root = null;
        var index = 0;
        foreach (var component in components.EnumerateArray())
        {
            if (component.ValueKind == JsonValueKind.Object
                && component.TryGetProperty("type", out var type)
                && type.ValueKind == JsonValueKind.String
                && type.GetString() == "mesh"
                && TryBlock(component, "mesh", out var mesh)
                && TryIntProperty(mesh, "modelId", out var modelId)
                && !HasNonNullProperty(mesh, "versionId")
                && activeVersionIdByModelId.TryGetValue(modelId, out var activeVersionId))
            {
                if (activeVersionId is int versionId)
                {
                    root ??= JsonNode.Parse(definition.GetRawText())!.AsObject();
                    root["components"]![index]!["mesh"]!["versionId"] = versionId;
                }
                else
                {
                    problems.Add(new VfxProblem(
                        $"components[{index}].mesh.versionId",
                        $"model {modelId} has no active version."));
                }
            }

            index++;
        }

        return root is null
            ? new VfxMeshVersionResolution(definition, problems)
            : new VfxMeshVersionResolution(JsonSerializer.SerializeToElement(root), problems);
    }

    private static bool TryBlock(JsonElement component, string name, out JsonElement block) =>
        component.TryGetProperty(name, out block) && block.ValueKind == JsonValueKind.Object;

    private static bool HasNonNullProperty(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out var element) && element.ValueKind != JsonValueKind.Null;

    private static bool TryIntProperty(JsonElement obj, string name, out int value)
    {
        value = 0;
        return obj.TryGetProperty(name, out var element)
               && element.ValueKind != JsonValueKind.Null
               && TryInt(element, out value);
    }

    private static JsonElement Parse(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    private static bool TryParse(string? json, out JsonElement element)
    {
        element = default;
        if (string.IsNullOrWhiteSpace(json))
            return false;

        try
        {
            using var document = JsonDocument.Parse(json);
            element = document.RootElement.Clone();
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    // ── Structure ──────────────────────────────────────────────────────────────

    private static void ValidateStructure(JsonElement definition, List<VfxProblem> problems)
    {
        if (!TryProperty(definition, "version", out var versionElement))
        {
            problems.Add(new VfxProblem("version", "is required."));
        }
        else if (!TryInt(versionElement, out var version) || version != Version)
        {
            problems.Add(new VfxProblem("version", $"must be {Version}."));
        }

        double? effectDuration = null;
        if (!TryProperty(definition, "duration", out var durationElement))
        {
            problems.Add(new VfxProblem("duration", "is required."));
        }
        else if (TryNumber(durationElement, out var duration))
        {
            if (duration < MinDuration || duration > MaxDuration)
            {
                problems.Add(new VfxProblem("duration", FormattableString.Invariant($"must be between {MinDuration} and {MaxDuration} seconds.")));
            }
            else
            {
                effectDuration = duration;
            }
        }
        else
        {
            problems.Add(new VfxProblem("duration", "must be a number."));
        }

        if (!TryProperty(definition, "loop", out var loopElement))
        {
            problems.Add(new VfxProblem("loop", "is required."));
        }
        else if (loopElement.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
        {
            problems.Add(new VfxProblem("loop", "must be true or false."));
        }

        if (!TryProperty(definition, "components", out var componentsElement))
        {
            problems.Add(new VfxProblem("components", "is required."));
        }
        else if (componentsElement.ValueKind != JsonValueKind.Array)
        {
            problems.Add(new VfxProblem("components", "must be an array."));
        }
        else
        {
            var components = componentsElement.EnumerateArray().ToList();
            if (components.Count > MaxComponents)
            {
                problems.Add(new VfxProblem("components", $"must have at most {MaxComponents} components."));
            }

            var ids = new HashSet<string>(StringComparer.Ordinal);
            for (var i = 0; i < components.Count; i++)
                ValidateComponent(components[i], i, effectDuration, ids, problems);
        }
    }

    private static void ValidateComponent(
        JsonElement component,
        int index,
        double? effectDuration,
        HashSet<string> ids,
        List<VfxProblem> problems)
    {
        var path = $"components[{index}]";
        if (component.ValueKind != JsonValueKind.Object)
        {
            problems.Add(new VfxProblem(path, "must be an object."));
            return;
        }

        ValidateId(component, path, ids, problems);
        var type = ValidateType(component, path, problems);
        ValidateName(component, path, problems);
        var start = ValidateStart(component, path, problems);
        var duration = ValidateComponentDuration(component, path, problems);

        if (start is not null && duration is not null && effectDuration is not null
            && start.Value + duration.Value > effectDuration.Value + 1e-9)
        {
            problems.Add(new VfxProblem($"{path}.duration", "start + duration exceeds the effect duration."));
        }

        if (TryProperty(component, "position", out var position)
            && position.ValueKind != JsonValueKind.Null)
        {
            ValidateVector3(position, $"{path}.position", problems);
        }

        if (type is not null)
        {
            foreach (var blockName in ComponentTypes)
            {
                if (blockName == type)
                    continue;

                if (TryProperty(component, blockName, out _))
                {
                    problems.Add(new VfxProblem(
                        $"{path}.{blockName}", $"is only allowed on a {blockName} component."));
                }
            }

            if (!TryProperty(component, type, out var block))
            {
                problems.Add(new VfxProblem($"{path}.{type}", $"is required for a {type} component."));
            }
            else
            {
                ValidateBlock(type, block, $"{path}.{type}", problems);
            }
        }

        if (TryProperty(component, "tracks", out var tracks))
            ValidateTracks(type, tracks, path, problems);
    }

    private static void ValidateId(JsonElement component, string path, HashSet<string> ids, List<VfxProblem> problems)
    {
        var idPath = $"{path}.id";
        if (!TryProperty(component, "id", out var element))
        {
            problems.Add(new VfxProblem(idPath, "is required."));
            return;
        }

        if (element.ValueKind != JsonValueKind.String)
        {
            problems.Add(new VfxProblem(idPath, "must be a string."));
            return;
        }

        var id = element.GetString() ?? string.Empty;
        if (id.Length == 0)
        {
            problems.Add(new VfxProblem(idPath, "cannot be empty."));
        }
        else if (id.Length > MaxComponentIdLength)
        {
            problems.Add(new VfxProblem(idPath, $"must be at most {MaxComponentIdLength} characters."));
        }
        else if (!ComponentIdPattern.IsMatch(id))
        {
            problems.Add(new VfxProblem(idPath, "must contain only lowercase letters, digits, '-' and '_'."));
        }
        else if (!ids.Add(id))
        {
            problems.Add(new VfxProblem(idPath, $"'{id}' is already used by another component."));
        }
    }

    private static string? ValidateType(JsonElement component, string path, List<VfxProblem> problems)
    {
        var typePath = $"{path}.type";
        if (!TryProperty(component, "type", out var element))
        {
            problems.Add(new VfxProblem(typePath, "is required."));
            return null;
        }

        if (element.ValueKind != JsonValueKind.String)
        {
            problems.Add(new VfxProblem(typePath, "must be a string."));
            return null;
        }

        var type = element.GetString();
        if (type is null || !ComponentTypes.Contains(type, StringComparer.Ordinal))
        {
            problems.Add(new VfxProblem(typePath, "must be one of particles, mesh, light or sound."));
            return null;
        }

        return type;
    }

    private static void ValidateName(JsonElement component, string path, List<VfxProblem> problems)
    {
        var namePath = $"{path}.name";
        if (!TryProperty(component, "name", out var element))
        {
            problems.Add(new VfxProblem(namePath, "is required."));
            return;
        }

        if (element.ValueKind != JsonValueKind.String)
        {
            problems.Add(new VfxProblem(namePath, "must be a string."));
            return;
        }

        var name = element.GetString() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(name))
        {
            problems.Add(new VfxProblem(namePath, "cannot be empty."));
        }
        else if (name.Length > MaxComponentNameLength)
        {
            problems.Add(new VfxProblem(namePath, $"must be at most {MaxComponentNameLength} characters."));
        }
    }

    private static double? ValidateStart(JsonElement component, string path, List<VfxProblem> problems)
    {
        var startPath = $"{path}.start";
        if (!TryProperty(component, "start", out var element))
        {
            problems.Add(new VfxProblem(startPath, "is required."));
            return null;
        }

        if (!TryNumber(element, out var start))
        {
            problems.Add(new VfxProblem(startPath, "must be a number."));
            return null;
        }

        if (start < 0)
        {
            problems.Add(new VfxProblem(startPath, "must be zero or greater."));
            return null;
        }

        return start;
    }

    private static double? ValidateComponentDuration(JsonElement component, string path, List<VfxProblem> problems)
    {
        var durationPath = $"{path}.duration";
        if (!TryProperty(component, "duration", out var element))
        {
            problems.Add(new VfxProblem(durationPath, "is required."));
            return null;
        }

        if (!TryNumber(element, out var duration))
        {
            problems.Add(new VfxProblem(durationPath, "must be a number."));
            return null;
        }

        if (duration <= 0)
        {
            problems.Add(new VfxProblem(durationPath, "must be greater than zero."));
            return null;
        }

        return duration;
    }

    private static void ValidateBlock(string type, JsonElement block, string path, List<VfxProblem> problems)
    {
        if (block.ValueKind != JsonValueKind.Object)
        {
            problems.Add(new VfxProblem(path, "must be an object."));
            return;
        }

        switch (type)
        {
            case Particles:
                ValidateParticles(block, path, problems);
                break;
            case "mesh":
                ValidateMesh(block, path, problems);
                break;
            case "light":
                ValidateLight(block, path, problems);
                break;
            case "sound":
                ValidateSound(block, path, problems);
                break;
        }
    }

    private static void ValidateParticles(JsonElement block, string path, List<VfxProblem> problems)
    {
        string? mode = null;
        var modePath = $"{path}.mode";
        if (!TryProperty(block, "mode", out var modeElement))
        {
            problems.Add(new VfxProblem(modePath, "is required."));
        }
        else if (modeElement.ValueKind != JsonValueKind.String
                 || modeElement.GetString() is not ("continuous" or "burst"))
        {
            problems.Add(new VfxProblem(modePath, "must be 'continuous' or 'burst'."));
        }
        else
        {
            mode = modeElement.GetString();
        }

        // The mode decides which emission parameter is required: rate for continuous
        // emission, count for a burst. The other may be omitted, but is range-checked
        // when given.
        if (mode == "continuous")
            RequireNumber(block, "rate", path, problems, min: 0, max: 2000);
        else
            OptionalNumber(block, "rate", path, problems, min: 0, max: 2000);

        if (mode == "burst")
            RequireInt(block, "count", path, problems, min: 1, max: 5000);
        else
            OptionalInt(block, "count", path, problems, min: 1, max: 5000);

        RequireNumber(block, "lifetime", path, problems, min: 0, max: 10, minExclusive: true);
        RequireNumber(block, "speed", path, problems, min: 0);
        RequireNumber(block, "spread", path, problems, min: 0, max: 180);
        RequireNumber(block, "gravity", path, problems);
        RequireNumber(block, "sizeStart", path, problems, min: 0);
        RequireNumber(block, "sizeEnd", path, problems, min: 0);
        RequireColor(block, "colorStart", path, problems);
        RequireColor(block, "colorEnd", path, problems);
        RequireNumber(block, "opacityStart", path, problems, min: 0, max: 1);
        RequireNumber(block, "opacityEnd", path, problems, min: 0, max: 1);

        var blendingPath = $"{path}.blending";
        if (!TryProperty(block, "blending", out var blendingElement))
        {
            problems.Add(new VfxProblem(blendingPath, "is required."));
        }
        else if (blendingElement.ValueKind != JsonValueKind.String
                 || blendingElement.GetString() is not ("additive" or "normal"))
        {
            problems.Add(new VfxProblem(blendingPath, "must be 'additive' or 'normal'."));
        }

        if (TryProperty(block, "spriteId", out var spriteId)
            && spriteId.ValueKind != JsonValueKind.Null
            && !TryInt(spriteId, out _))
        {
            problems.Add(new VfxProblem($"{path}.spriteId", "must be an integer or null."));
        }

        RequireInt(block, "seed", path, problems);
    }

    private static void ValidateMesh(JsonElement block, string path, List<VfxProblem> problems)
    {
        RequireInt(block, "modelId", path, problems);
        if (TryProperty(block, "versionId", out var versionId)
            && versionId.ValueKind != JsonValueKind.Null
            && !TryInt(versionId, out _))
        {
            problems.Add(new VfxProblem($"{path}.versionId", "must be an integer or null."));
        }
    }

    private static void ValidateLight(JsonElement block, string path, List<VfxProblem> problems)
    {
        RequireColor(block, "color", path, problems);
        RequireNumber(block, "range", path, problems, min: 0, minExclusive: true);
    }

    private static void ValidateSound(JsonElement block, string path, List<VfxProblem> problems)
    {
        RequireInt(block, "soundId", path, problems);
        RequireNumber(block, "volume", path, problems, min: 0, max: 1);
    }

    private static void ValidateTracks(string? type, JsonElement tracks, string componentPath, List<VfxProblem> problems)
    {
        var tracksPath = $"{componentPath}.tracks";
        if (tracks.ValueKind != JsonValueKind.Object)
        {
            problems.Add(new VfxProblem(tracksPath, "must be an object."));
            return;
        }

        var allowed = type switch
        {
            "mesh" => MeshTracks,
            "light" => LightTracks,
            _ => []
        };

        foreach (var track in tracks.EnumerateObject())
        {
            var trackPath = $"{tracksPath}.{track.Name}";
            if (type is null)
                continue;

            if (!allowed.Contains(track.Name, StringComparer.Ordinal))
            {
                problems.Add(new VfxProblem(trackPath, $"is not allowed on a {type} component."));
                continue;
            }

            ValidateKeyframes(track.Value, trackPath, track.Name, problems);
        }
    }

    private static void ValidateKeyframes(
        JsonElement keyframes, string path, string track, List<VfxProblem> problems)
    {
        if (keyframes.ValueKind != JsonValueKind.Array)
        {
            problems.Add(new VfxProblem(path, "must be an array of [time, value] pairs."));
            return;
        }

        var index = 0;
        foreach (var keyframe in keyframes.EnumerateArray())
        {
            var keyframePath = $"{path}[{index}]";
            if (keyframe.ValueKind != JsonValueKind.Array)
            {
                problems.Add(new VfxProblem(keyframePath, "must be a [time, value] pair."));
                index++;
                continue;
            }

            var pair = keyframe.EnumerateArray().ToList();
            if (pair.Count != 2
                || !TryNumber(pair[0], out var time)
                || !TryNumber(pair[1], out var value))
            {
                problems.Add(new VfxProblem(keyframePath, "must be a [time, value] pair of numbers."));
                index++;
                continue;
            }

            if (time < 0)
                problems.Add(new VfxProblem($"{keyframePath}[0]", "time must be zero or greater."));

            var valuePath = $"{keyframePath}[1]";
            switch (track)
            {
                case "scale" when value < 0:
                    problems.Add(new VfxProblem(valuePath, "must be zero or greater."));
                    break;
                case "opacity" when value < 0 || value > 1:
                    problems.Add(new VfxProblem(valuePath, "must be between 0 and 1."));
                    break;
                case "intensity" when value < 0:
                    problems.Add(new VfxProblem(valuePath, "must be zero or greater."));
                    break;
            }

            index++;
        }
    }

    private static void ValidateVector3(JsonElement element, string path, List<VfxProblem> problems)
    {
        if (element.ValueKind != JsonValueKind.Array)
        {
            problems.Add(new VfxProblem(path, "must be an array of three numbers."));
            return;
        }

        var values = element.EnumerateArray().ToList();
        if (values.Count != 3 || values.Any(v => !TryNumber(v, out _)))
        {
            problems.Add(new VfxProblem(path, "must be an array of three numbers."));
        }
    }

    // ── Field helpers ──────────────────────────────────────────────────────────

    private static void RequireNumber(
        JsonElement obj,
        string name,
        string path,
        List<VfxProblem> problems,
        double? min = null,
        double? max = null,
        bool minExclusive = false)
    {
        var fieldPath = $"{path}.{name}";
        if (!TryProperty(obj, name, out var element))
        {
            problems.Add(new VfxProblem(fieldPath, "is required."));
            return;
        }

        if (!TryNumber(element, out var value))
        {
            problems.Add(new VfxProblem(fieldPath, "must be a number."));
            return;
        }

        if (min is not null && (minExclusive ? value <= min : value < min))
        {
            problems.Add(new VfxProblem(fieldPath,
                minExclusive
                    ? FormattableString.Invariant($"must be greater than {min}.")
                    : FormattableString.Invariant($"must be {min} or greater.")));
        }
        else if (max is not null && value > max)
        {
            problems.Add(new VfxProblem(fieldPath, FormattableString.Invariant($"must be at most {max}.")));
        }
    }

    private static void OptionalNumber(
        JsonElement obj,
        string name,
        string path,
        List<VfxProblem> problems,
        double? min = null,
        double? max = null,
        bool minExclusive = false)
    {
        if (TryProperty(obj, name, out _))
            RequireNumber(obj, name, path, problems, min, max, minExclusive);
    }

    private static void RequireInt(
        JsonElement obj, string name, string path, List<VfxProblem> problems,
        int? min = null, int? max = null)
    {
        var fieldPath = $"{path}.{name}";
        if (!TryProperty(obj, name, out var element))
        {
            problems.Add(new VfxProblem(fieldPath, "is required."));
            return;
        }

        if (!TryInt(element, out var value))
        {
            problems.Add(new VfxProblem(fieldPath, "must be an integer."));
            return;
        }

        if (min is not null && value < min)
        {
            problems.Add(new VfxProblem(fieldPath, $"must be {min} or greater."));
        }
        else if (max is not null && value > max)
        {
            problems.Add(new VfxProblem(fieldPath, $"must be at most {max}."));
        }
    }

    private static void OptionalInt(
        JsonElement obj, string name, string path, List<VfxProblem> problems,
        int? min = null, int? max = null)
    {
        if (TryProperty(obj, name, out _))
            RequireInt(obj, name, path, problems, min, max);
    }

    private static void RequireColor(JsonElement obj, string name, string path, List<VfxProblem> problems)
    {
        var fieldPath = $"{path}.{name}";
        if (!TryProperty(obj, name, out var element))
        {
            problems.Add(new VfxProblem(fieldPath, "is required."));
            return;
        }

        if (element.ValueKind != JsonValueKind.String
            || element.GetString() is not { } color
            || !HexColorPattern.IsMatch(color))
        {
            problems.Add(new VfxProblem(fieldPath, "must be a colour in #rrggbb format."));
        }
    }

    private static bool TryProperty(JsonElement obj, string name, out JsonElement value) =>
        obj.TryGetProperty(name, out value);

    private static bool TryNumber(JsonElement element, out double value)
    {
        value = 0;
        return element.ValueKind == JsonValueKind.Number && element.TryGetDouble(out value);
    }

    private static bool TryInt(JsonElement element, out int value)
    {
        value = 0;
        if (element.ValueKind != JsonValueKind.Number || !element.TryGetDouble(out var number))
            return false;

        if (number < int.MinValue || number > int.MaxValue || number != Math.Floor(number))
            return false;

        value = (int)number;
        return true;
    }
}
