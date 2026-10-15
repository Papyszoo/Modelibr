using System.Text.Json;
using System.Text.RegularExpressions;

namespace Domain.ValueObjects;

/// <summary>One validation problem: the path of the field and what is wrong with it.</summary>
public sealed record MaterialEffectsProblem(string Path, string Message);

/// <summary>
/// The effects document as read from a caller, plus every problem found in it. A null
/// definition means "no effects" - a material without effects is the normal case.
/// </summary>
public sealed record MaterialEffectsRead(JsonElement? Definition, IReadOnlyList<MaterialEffectsProblem> Problems)
{
    public bool IsValid => Problems.Count == 0;
}

/// <summary>
/// The v1 material-effects contract: parsing and structural validation of the document
/// stored in <see cref="Models.Material.EffectsJson"/> and consumed by the preview and the
/// Godot export.
///
/// Validation returns EVERY problem, each naming the full path of the field it is about
/// (<c>effects[1].drivers.charge.scale</c>), because an agent that has to resubmit once per
/// typo burns a turn per typo. Like <c>VfxDefinition</c>, this contract is pure - it knows
/// nothing about repositories, storage or the command pipeline.
/// </summary>
public static class MaterialEffectsDefinition
{
    public const int Version = 1;
    public const int MaxEffects = 4;

    private static readonly string[] EffectTypes = ["jelly_wobble", "rim", "translucency", "emission_pulse"];
    private static readonly string[] DriverInputs = ["speed", "impulse", "charge"];

    // The numeric parameters each effect type allows a driver on. `seed` is an integer,
    // so it is deliberately not drivable.
    private static readonly string[] JellyWobbleParams = ["amplitude", "frequency", "waveScale"];
    private static readonly string[] RimParams = ["power", "intensity"];
    private static readonly string[] TranslucencyParams = ["thickness"];
    private static readonly string[] EmissionPulseParams = ["intensity", "rate"];

    private static readonly Regex HexColorPattern = new("^#[0-9a-fA-F]{6}$", RegexOptions.Compiled);

    /// <summary>
    /// Reads a caller-supplied document and validates it. Null, a JSON null or a missing
    /// value means no effects at all. A JSON string is parsed, so an MCP client that cannot
    /// express an object still reaches the same contract.
    /// </summary>
    public static MaterialEffectsRead Read(JsonElement? input)
    {
        var problems = new List<MaterialEffectsProblem>();

        if (input is null || input.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
            return new MaterialEffectsRead(null, problems);

        JsonElement definition;
        if (input.Value.ValueKind == JsonValueKind.String)
        {
            if (!TryParse(input.Value.GetString(), out definition))
            {
                problems.Add(new MaterialEffectsProblem("effects", "must be a JSON object."));
                return new MaterialEffectsRead(null, problems);
            }
        }
        else if (input.Value.ValueKind == JsonValueKind.Object)
        {
            definition = input.Value;
        }
        else
        {
            problems.Add(new MaterialEffectsProblem("effects", "must be a JSON object."));
            return new MaterialEffectsRead(null, problems);
        }

        if (definition.ValueKind != JsonValueKind.Object)
        {
            problems.Add(new MaterialEffectsProblem("effects", "must be a JSON object."));
            return new MaterialEffectsRead(null, problems);
        }

        return new MaterialEffectsRead(definition, Validate(definition));
    }

    /// <summary>Validates an already-materialised effects element.</summary>
    public static IReadOnlyList<MaterialEffectsProblem> Validate(JsonElement definition)
    {
        var problems = new List<MaterialEffectsProblem>();
        if (definition.ValueKind != JsonValueKind.Object)
        {
            problems.Add(new MaterialEffectsProblem("effects", "must be a JSON object."));
            return problems;
        }

        ValidateStructure(definition, problems);
        return problems;
    }

    /// <summary>Compact camelCase JSON, the form the column stores.</summary>
    public static string Serialize(JsonElement definition) => JsonSerializer.Serialize(definition);

    /// <summary>
    /// Parses a stored document back into an element; malformed or missing JSON yields
    /// null (no effects), which is exactly how the read sides present it.
    /// </summary>
    public static JsonElement? Parse(string? effectsJson)
    {
        if (string.IsNullOrWhiteSpace(effectsJson))
            return null;

        return TryParse(effectsJson, out var element) && element.ValueKind == JsonValueKind.Object
            ? element
            : null;
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

    private static void ValidateStructure(JsonElement definition, List<MaterialEffectsProblem> problems)
    {
        if (!TryProperty(definition, "version", out var versionElement))
        {
            problems.Add(new MaterialEffectsProblem("version", "is required."));
        }
        else if (!TryInt(versionElement, out var version) || version != Version)
        {
            problems.Add(new MaterialEffectsProblem("version", $"must be {Version}."));
        }

        if (!TryProperty(definition, "effects", out var effectsElement))
        {
            problems.Add(new MaterialEffectsProblem("effects", "is required."));
        }
        else if (effectsElement.ValueKind != JsonValueKind.Array)
        {
            problems.Add(new MaterialEffectsProblem("effects", "must be an array."));
        }
        else
        {
            var effects = effectsElement.EnumerateArray().ToList();
            if (effects.Count > MaxEffects)
            {
                problems.Add(new MaterialEffectsProblem("effects", $"must have at most {MaxEffects} effects."));
            }

            var types = new HashSet<string>(StringComparer.Ordinal);
            for (var i = 0; i < effects.Count; i++)
                ValidateEffect(effects[i], i, types, problems);
        }

        if (TryProperty(definition, "previewInputs", out var previewElement)
            && previewElement.ValueKind != JsonValueKind.Null)
        {
            ValidatePreviewInputs(previewElement, problems);
        }
    }

    private static void ValidateEffect(
        JsonElement effect,
        int index,
        HashSet<string> types,
        List<MaterialEffectsProblem> problems)
    {
        var path = $"effects[{index}]";
        if (effect.ValueKind != JsonValueKind.Object)
        {
            problems.Add(new MaterialEffectsProblem(path, "must be an object."));
            return;
        }

        var typePath = $"{path}.type";
        string? type = null;
        if (!TryProperty(effect, "type", out var typeElement))
        {
            problems.Add(new MaterialEffectsProblem(typePath, "is required."));
        }
        else if (typeElement.ValueKind != JsonValueKind.String
                 || typeElement.GetString() is not { } name
                 || !EffectTypes.Contains(name, StringComparer.Ordinal))
        {
            problems.Add(new MaterialEffectsProblem(
                typePath, "must be one of jelly_wobble, rim, translucency or emission_pulse."));
        }
        else
        {
            type = name;
            if (!types.Add(type))
            {
                problems.Add(new MaterialEffectsProblem(
                    typePath, $"'{type}' is already used by another effect."));
            }
        }

        switch (type)
        {
            case "jelly_wobble":
                ValidateJellyWobble(effect, path, problems);
                break;
            case "rim":
                ValidateRim(effect, path, problems);
                break;
            case "translucency":
                ValidateTranslucency(effect, path, problems);
                break;
            case "emission_pulse":
                ValidateEmissionPulse(effect, path, problems);
                break;
        }

        if (type is not null)
            ValidateDrivers(effect, path, type, problems);
    }

    private static void ValidateJellyWobble(JsonElement effect, string path, List<MaterialEffectsProblem> problems)
    {
        RequireNumber(effect, "amplitude", path, problems, min: 0, max: 0.5);
        RequireNumber(effect, "frequency", path, problems, min: 0, max: 10);
        RequireNumber(effect, "waveScale", path, problems, min: 0, max: 20);
        RequireInt(effect, "seed", path, problems, min: 0, max: 1000);
    }

    private static void ValidateRim(JsonElement effect, string path, List<MaterialEffectsProblem> problems)
    {
        RequireColor(effect, "color", path, problems);
        RequireNumber(effect, "power", path, problems, min: 0.5, max: 8);
        RequireNumber(effect, "intensity", path, problems, min: 0, max: 10);
    }

    private static void ValidateTranslucency(JsonElement effect, string path, List<MaterialEffectsProblem> problems)
    {
        RequireColor(effect, "interiorColor", path, problems);
        RequireNumber(effect, "thickness", path, problems, min: 0, max: 1);
    }

    private static void ValidateEmissionPulse(JsonElement effect, string path, List<MaterialEffectsProblem> problems)
    {
        RequireColor(effect, "color", path, problems);
        RequireNumber(effect, "intensity", path, problems, min: 0, max: 10);
        RequireNumber(effect, "rate", path, problems, min: 0, max: 20);
    }

    private static void ValidateDrivers(
        JsonElement effect,
        string path,
        string type,
        List<MaterialEffectsProblem> problems)
    {
        if (!TryProperty(effect, "drivers", out var drivers) || drivers.ValueKind == JsonValueKind.Null)
            return;

        var driversPath = $"{path}.drivers";
        if (drivers.ValueKind != JsonValueKind.Object)
        {
            problems.Add(new MaterialEffectsProblem(driversPath, "must be an object."));
            return;
        }

        var allowed = type switch
        {
            "jelly_wobble" => JellyWobbleParams,
            "rim" => RimParams,
            "translucency" => TranslucencyParams,
            "emission_pulse" => EmissionPulseParams,
            _ => []
        };

        foreach (var driver in drivers.EnumerateObject())
        {
            var driverPath = $"{driversPath}.{driver.Name}";
            if (!allowed.Contains(driver.Name, StringComparer.Ordinal))
            {
                problems.Add(new MaterialEffectsProblem(
                    driverPath, $"is not a numeric parameter of a {type} effect."));
                continue;
            }

            if (driver.Value.ValueKind != JsonValueKind.Object)
            {
                problems.Add(new MaterialEffectsProblem(driverPath, "must be an object with input and scale."));
                continue;
            }

            var inputPath = $"{driverPath}.input";
            if (!TryProperty(driver.Value, "input", out var inputElement))
            {
                problems.Add(new MaterialEffectsProblem(inputPath, "is required."));
            }
            else if (inputElement.ValueKind != JsonValueKind.String
                     || inputElement.GetString() is not { } input
                     || !DriverInputs.Contains(input, StringComparer.Ordinal))
            {
                problems.Add(new MaterialEffectsProblem(inputPath, "must be one of speed, impulse or charge."));
            }

            RequireNumber(driver.Value, "scale", driverPath, problems, min: -100, max: 100);
        }
    }

    private static void ValidatePreviewInputs(JsonElement preview, List<MaterialEffectsProblem> problems)
    {
        if (preview.ValueKind != JsonValueKind.Object)
        {
            problems.Add(new MaterialEffectsProblem("previewInputs", "must be an object."));
            return;
        }

        foreach (var input in preview.EnumerateObject())
        {
            switch (input.Name)
            {
                case "speed":
                    RequireNumber(preview, "speed", "previewInputs", problems, min: 0, max: 20);
                    break;
                case "impulse":
                    RequireNumber(preview, "impulse", "previewInputs", problems, min: 0, max: 1);
                    break;
                case "charge":
                    RequireNumber(preview, "charge", "previewInputs", problems, min: 0, max: 1);
                    break;
                default:
                    problems.Add(new MaterialEffectsProblem(
                        $"previewInputs.{input.Name}", "is not a preview input; expected speed, impulse or charge."));
                    break;
            }
        }
    }

    // ── Field helpers ──────────────────────────────────────────────────────────

    private static void RequireNumber(
        JsonElement obj,
        string name,
        string path,
        List<MaterialEffectsProblem> problems,
        double? min = null,
        double? max = null)
    {
        var fieldPath = $"{path}.{name}";
        if (!TryProperty(obj, name, out var element))
        {
            problems.Add(new MaterialEffectsProblem(fieldPath, "is required."));
            return;
        }

        if (!TryNumber(element, out var value))
        {
            problems.Add(new MaterialEffectsProblem(fieldPath, "must be a number."));
            return;
        }

        if (min is not null && value < min)
        {
            problems.Add(new MaterialEffectsProblem(
                fieldPath, FormattableString.Invariant($"must be {min} or greater.")));
        }
        else if (max is not null && value > max)
        {
            problems.Add(new MaterialEffectsProblem(
                fieldPath, FormattableString.Invariant($"must be at most {max}.")));
        }
    }

    private static void RequireInt(
        JsonElement obj,
        string name,
        string path,
        List<MaterialEffectsProblem> problems,
        int? min = null,
        int? max = null)
    {
        var fieldPath = $"{path}.{name}";
        if (!TryProperty(obj, name, out var element))
        {
            problems.Add(new MaterialEffectsProblem(fieldPath, "is required."));
            return;
        }

        if (!TryInt(element, out var value))
        {
            problems.Add(new MaterialEffectsProblem(fieldPath, "must be an integer."));
            return;
        }

        if (min is not null && value < min)
        {
            problems.Add(new MaterialEffectsProblem(fieldPath, $"must be {min} or greater."));
        }
        else if (max is not null && value > max)
        {
            problems.Add(new MaterialEffectsProblem(fieldPath, $"must be at most {max}."));
        }
    }

    private static void RequireColor(JsonElement obj, string name, string path, List<MaterialEffectsProblem> problems)
    {
        var fieldPath = $"{path}.{name}";
        if (!TryProperty(obj, name, out var element))
        {
            problems.Add(new MaterialEffectsProblem(fieldPath, "is required."));
            return;
        }

        if (element.ValueKind != JsonValueKind.String
            || element.GetString() is not { } color
            || !HexColorPattern.IsMatch(color))
        {
            problems.Add(new MaterialEffectsProblem(fieldPath, "must be a colour in #rrggbb format."));
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
