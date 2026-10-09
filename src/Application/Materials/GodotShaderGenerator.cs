using System.Globalization;
using System.Text;
using System.Text.Json;
using Domain.Models;
using Domain.ValueObjects;

namespace Application.Materials;

/// <summary>
/// Writes a material's parameters and v1 effects document as a Godot 4 spatial shader
/// (<c>.gdshader</c>) and its ShaderMaterial resource (<c>.tres</c>).
///
/// The shader is Mobile-renderer safe on purpose: no SCREEN_TEXTURE, no DEPTH_TEXTURE and
/// no TIME. <c>effect_time</c> and the three input uniforms are driven by the game, so an
/// exported material plays in sync with whatever gameplay code feeds it. The effect math
/// mirrors the browser preview: jelly_wobble displaces the vertex along its normal,
/// rim/translucency/emission_pulse add to EMISSION, and everything adds to the material's
/// own emission.
///
/// Colour values are written exactly as the material stores them; effect colours are the
/// sRGB components of the hex the document carries, and Godot's <c>source_color</c> hint
/// converts them to linear on the way in.
/// </summary>
public static class GodotShaderGenerator
{
    /// <summary>The whole material as <c>shader_type spatial;</c> with every effect uniform.</summary>
    public static string WriteShader(Material material)
    {
        var effects = EffectsOf(material);
        var hasJelly = TryEffect(effects, "jelly_wobble", out var jelly);

        var sb = new StringBuilder();
        sb.Append("shader_type spatial;\n\n");

        sb.Append("// Driven by the game each frame; effect_time is the effects clock (no engine clock is read).\n");
        sb.Append("uniform float effect_time = 0.0;\n");
        sb.Append("uniform float input_speed = 0.0;\n");
        sb.Append("uniform float input_impulse = 0.0;\n");
        sb.Append("uniform float input_charge = 0.0;\n\n");

        sb.Append("// Base material.\n");
        sb.Append($"uniform vec4 albedo_color : source_color = vec4({F(material.Parameters.BaseColorR)}, {F(material.Parameters.BaseColorG)}, {F(material.Parameters.BaseColorB)}, {F(material.Parameters.BaseColorA)});\n");
        sb.Append($"uniform float roughness_value : hint_range(0.0, 1.0) = {F(material.Parameters.Roughness)};\n");
        sb.Append($"uniform float metallic_value : hint_range(0.0, 1.0) = {F(material.Parameters.Metallic)};\n");
        sb.Append($"uniform vec3 emissive_color : source_color = vec3({F(material.Parameters.EmissiveR)}, {F(material.Parameters.EmissiveG)}, {F(material.Parameters.EmissiveB)});\n\n");

        sb.Append("// Optional maps; a texture uniform left unset means no map.\n");
        sb.Append("uniform sampler2D albedo_texture : source_color, hint_default_white;\n");
        sb.Append("uniform sampler2D normal_texture : hint_normal;\n");
        sb.Append("uniform sampler2D roughness_texture : hint_default_white;\n");
        sb.Append("uniform sampler2D metallic_texture : hint_default_white;\n");
        sb.Append("uniform sampler2D emission_texture : source_color, hint_default_white;\n");

        foreach (var effect in effects)
        {
            sb.Append('\n');
            switch (Type(effect))
            {
                case "jelly_wobble":
                    sb.Append("// jelly_wobble\n");
                    sb.Append($"uniform float jelly_amplitude : hint_range(0.0, 0.5) = {F(Num(effect, "amplitude", 0.03))};\n");
                    sb.Append($"uniform float jelly_frequency : hint_range(0.0, 10.0) = {F(Num(effect, "frequency", 1.5))};\n");
                    sb.Append($"uniform float jelly_wave_scale : hint_range(0.0, 20.0) = {F(Num(effect, "waveScale", 4.0))};\n");
                    sb.Append($"uniform float jelly_seed : hint_range(0.0, 1000.0) = {F(Num(effect, "seed", 0))};\n");
                    break;

                case "rim":
                    sb.Append("// rim\n");
                    sb.Append($"uniform vec3 rim_color : source_color = vec3({HexComponents(Text(effect, "color", "#ffffff"))});\n");
                    sb.Append($"uniform float rim_power : hint_range(0.5, 8.0) = {F(Num(effect, "power", 3.0))};\n");
                    sb.Append($"uniform float rim_intensity : hint_range(0.0, 10.0) = {F(Num(effect, "intensity", 1.0))};\n");
                    break;

                case "translucency":
                    sb.Append("// translucency\n");
                    sb.Append($"uniform vec3 translucency_interior_color : source_color = vec3({HexComponents(Text(effect, "interiorColor", "#ffffff"))});\n");
                    sb.Append($"uniform float translucency_thickness : hint_range(0.0, 1.0) = {F(Num(effect, "thickness", 0.5))};\n");
                    break;

                case "emission_pulse":
                    sb.Append("// emission_pulse\n");
                    sb.Append($"uniform vec3 emission_pulse_color : source_color = vec3({HexComponents(Text(effect, "color", "#ffffff"))});\n");
                    sb.Append($"uniform float emission_pulse_intensity : hint_range(0.0, 10.0) = {F(Num(effect, "intensity", 0.0))};\n");
                    sb.Append($"uniform float emission_pulse_rate : hint_range(0.0, 20.0) = {F(Num(effect, "rate", 1.0))};\n");
                    break;
            }
        }

        sb.Append("\nvoid vertex() {\n");
        if (hasJelly)
        {
            var declarations = new List<string>();
            var amplitude = Effective(jelly, "jelly_amplitude", "amplitude", min: 0, max: 0.5, declarations);
            var frequency = Effective(jelly, "jelly_frequency", "frequency", min: 0, max: 10, declarations);
            var waveScale = Effective(jelly, "jelly_wave_scale", "waveScale", min: 0, max: 20, declarations);

            sb.Append("    // d = amplitude * sin(2*pi*frequency*t + waveScale*(x + 1.3y + 0.7z) + seed)\n");
            foreach (var declaration in declarations)
                sb.Append(declaration).Append('\n');
            sb.Append($"    float jelly_d = {amplitude} * sin(6.2831853 * {frequency} * effect_time + {waveScale} * (VERTEX.x + 1.3 * VERTEX.y + 0.7 * VERTEX.z) + jelly_seed);\n");
            sb.Append("    VERTEX += NORMAL * jelly_d;\n");
        }
        else
        {
            sb.Append("    // No jelly_wobble: the mesh keeps its authored vertex positions.\n");
        }
        sb.Append("}\n\n");

        sb.Append("void fragment() {\n");
        sb.Append("    ALBEDO = albedo_color.rgb * texture(albedo_texture, UV).rgb;\n");
        sb.Append("    ROUGHNESS = clamp(roughness_value * texture(roughness_texture, UV).r, 0.0, 1.0);\n");
        sb.Append("    METALLIC = clamp(metallic_value * texture(metallic_texture, UV).r, 0.0, 1.0);\n");
        sb.Append("    NORMAL_MAP = texture(normal_texture, UV).rgb;\n");
        sb.Append("    NORMAL_MAP_DEPTH = 1.0;\n");
        sb.Append("    EMISSION = emissive_color * texture(emission_texture, UV).rgb;\n");

        if (TryEffect(effects, "rim", out var rim))
        {
            var declarations = new List<string>();
            var power = Effective(rim, "rim_power", "power", min: 0.5, max: 8, declarations);
            var intensity = Effective(rim, "rim_intensity", "intensity", min: 0, max: 10, declarations);

            sb.Append("\n    // emission += color * intensity * pow(1 - dot(N, V), power)\n");
            foreach (var declaration in declarations)
                sb.Append(declaration).Append('\n');
            sb.Append($"    EMISSION += rim_color * {intensity} * pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), {power});\n");
        }

        if (TryEffect(effects, "translucency", out var translucency))
        {
            var declarations = new List<string>();
            var thickness = Effective(translucency, "translucency_thickness", "thickness", min: 0, max: 1, declarations);

            sb.Append("\n    // emission += interiorColor * thickness * 0.5 * dot(N, V)\n");
            foreach (var declaration in declarations)
                sb.Append(declaration).Append('\n');
            sb.Append($"    EMISSION += translucency_interior_color * {thickness} * 0.5 * clamp(dot(NORMAL, VIEW), 0.0, 1.0);\n");
        }

        if (TryEffect(effects, "emission_pulse", out var pulse))
        {
            var declarations = new List<string>();
            var intensity = Effective(pulse, "emission_pulse_intensity", "intensity", min: 0, max: 10, declarations);
            var rate = Effective(pulse, "emission_pulse_rate", "rate", min: 0, max: 20, declarations);

            sb.Append("\n    // emission += color * intensity * (0.5 + 0.5 * sin(2*pi*rate*t))\n");
            foreach (var declaration in declarations)
                sb.Append(declaration).Append('\n');
            sb.Append($"    EMISSION += emission_pulse_color * {intensity} * (0.5 + 0.5 * sin(6.2831853 * {rate} * effect_time));\n");
        }

        sb.Append("}\n");
        return sb.ToString();
    }

    /// <summary>
    /// The ShaderMaterial resource: references the shader and pins every non-texture uniform
    /// to the material's values. Texture uniforms stay unset on purpose - a parameters-only
    /// material has no maps.
    /// </summary>
    public static string WriteResource(Material material, string shaderPath)
    {
        var effects = EffectsOf(material);

        var sb = new StringBuilder();
        sb.Append("[gd_resource type=\"ShaderMaterial\" load_steps=2 format=3]\n\n");
        sb.Append($"[ext_resource type=\"Shader\" path=\"{shaderPath}\" id=\"1_shader\"]\n\n");
        sb.Append("[resource]\n");
        sb.Append("shader = ExtResource(\"1_shader\")\n");
        sb.Append("shader_parameter/effect_time = 0.0\n");
        sb.Append("shader_parameter/input_speed = 0.0\n");
        sb.Append("shader_parameter/input_impulse = 0.0\n");
        sb.Append("shader_parameter/input_charge = 0.0\n");
        sb.Append($"shader_parameter/albedo_color = Color({F(material.Parameters.BaseColorR)}, {F(material.Parameters.BaseColorG)}, {F(material.Parameters.BaseColorB)}, {F(material.Parameters.BaseColorA)})\n");
        sb.Append($"shader_parameter/roughness_value = {F(material.Parameters.Roughness)}\n");
        sb.Append($"shader_parameter/metallic_value = {F(material.Parameters.Metallic)}\n");
        sb.Append($"shader_parameter/emissive_color = Color({F(material.Parameters.EmissiveR)}, {F(material.Parameters.EmissiveG)}, {F(material.Parameters.EmissiveB)}, 1.0)\n");

        foreach (var effect in effects)
        {
            switch (Type(effect))
            {
                case "jelly_wobble":
                    sb.Append($"shader_parameter/jelly_amplitude = {F(Num(effect, "amplitude", 0.03))}\n");
                    sb.Append($"shader_parameter/jelly_frequency = {F(Num(effect, "frequency", 1.5))}\n");
                    sb.Append($"shader_parameter/jelly_wave_scale = {F(Num(effect, "waveScale", 4.0))}\n");
                    sb.Append($"shader_parameter/jelly_seed = {F(Num(effect, "seed", 0))}\n");
                    break;

                case "rim":
                    sb.Append($"shader_parameter/rim_color = Color({HexComponents(Text(effect, "color", "#ffffff"))}, 1.0)\n");
                    sb.Append($"shader_parameter/rim_power = {F(Num(effect, "power", 3.0))}\n");
                    sb.Append($"shader_parameter/rim_intensity = {F(Num(effect, "intensity", 1.0))}\n");
                    break;

                case "translucency":
                    sb.Append($"shader_parameter/translucency_interior_color = Color({HexComponents(Text(effect, "interiorColor", "#ffffff"))}, 1.0)\n");
                    sb.Append($"shader_parameter/translucency_thickness = {F(Num(effect, "thickness", 0.5))}\n");
                    break;

                case "emission_pulse":
                    sb.Append($"shader_parameter/emission_pulse_color = Color({HexComponents(Text(effect, "color", "#ffffff"))}, 1.0)\n");
                    sb.Append($"shader_parameter/emission_pulse_intensity = {F(Num(effect, "intensity", 0.0))}\n");
                    sb.Append($"shader_parameter/emission_pulse_rate = {F(Num(effect, "rate", 1.0))}\n");
                    break;
            }
        }

        return sb.ToString();
    }

    // ── Document helpers ───────────────────────────────────────────────────────

    private static List<JsonElement> EffectsOf(Material material)
    {
        var definition = MaterialEffectsDefinition.Parse(material.EffectsJson);
        if (definition is null
            || !definition.Value.TryGetProperty("effects", out var effects)
            || effects.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        return effects.EnumerateArray().Where(effect => effect.ValueKind == JsonValueKind.Object).ToList();
    }

    private static bool TryEffect(List<JsonElement> effects, string type, out JsonElement effect)
    {
        foreach (var candidate in effects)
        {
            if (Type(candidate) == type)
            {
                effect = candidate;
                return true;
            }
        }

        effect = default;
        return false;
    }

    private static string Type(JsonElement effect) =>
        effect.TryGetProperty("type", out var type) && type.ValueKind == JsonValueKind.String
            ? type.GetString() ?? string.Empty
            : string.Empty;

    private static double Num(JsonElement effect, string name, double fallback) =>
        effect.TryGetProperty(name, out var element)
        && element.ValueKind == JsonValueKind.Number
        && element.TryGetDouble(out var value)
            ? value
            : fallback;

    private static string Text(JsonElement effect, string name, string fallback) =>
        effect.TryGetProperty(name, out var element) && element.ValueKind == JsonValueKind.String
            ? element.GetString() ?? fallback
            : fallback;

    // ── Driver helpers ─────────────────────────────────────────────────────────

    /// <summary>
    /// The expression the effect formula must use for one parameter: the uniform itself when
    /// undriven, or a clamped <c>base + input * scale</c> variable when a driver exists. The
    /// variable's declaration is appended to <paramref name="declarations"/> for the caller
    /// to place at the top of its function.
    /// </summary>
    private static string Effective(
        JsonElement effect,
        string uniform,
        string parameter,
        double min,
        double max,
        List<string> declarations)
    {
        if (!TryDriver(effect, parameter, out var input, out var scale))
            return uniform;

        var effective = $"{uniform}_eff";
        declarations.Add(
            $"    float {effective} = clamp({uniform} + {InputUniform(input)} * {F(scale)}, {F(min)}, {F(max)});");
        return effective;
    }

    private static bool TryDriver(JsonElement effect, string parameter, out string input, out double scale)
    {
        input = string.Empty;
        scale = 0;

        if (!effect.TryGetProperty("drivers", out var drivers) || drivers.ValueKind != JsonValueKind.Object)
            return false;

        if (!drivers.TryGetProperty(parameter, out var driver) || driver.ValueKind != JsonValueKind.Object)
            return false;

        if (!driver.TryGetProperty("input", out var inputElement) || inputElement.ValueKind != JsonValueKind.String)
            return false;

        var name = inputElement.GetString();
        if (name is not ("speed" or "impulse" or "charge"))
            return false;

        input = name;
        scale = Num(driver, "scale", 0);
        return true;
    }

    private static string InputUniform(string input) => input switch
    {
        "speed" => "input_speed",
        "impulse" => "input_impulse",
        _ => "input_charge"
    };

    // ── Formatting ─────────────────────────────────────────────────────────────

    /// <summary>Invariant formatting with a decimal point, so Godot reads a float.</summary>
    private static string F(double value) =>
        value.ToString("0.0#####", CultureInfo.InvariantCulture);

    /// <summary>The sRGB components of a <c>#rrggbb</c> string, comma-separated for a vec3 or Color.</summary>
    private static string HexComponents(string hex)
    {
        if (hex.Length != 7 || hex[0] != '#')
            return "0.0, 0.0, 0.0";

        var r = Convert.ToInt32(hex[1..3], 16) / 255.0;
        var g = Convert.ToInt32(hex[3..5], 16) / 255.0;
        var b = Convert.ToInt32(hex[5..7], 16) / 255.0;
        return $"{F(r)}, {F(g)}, {F(b)}";
    }
}
