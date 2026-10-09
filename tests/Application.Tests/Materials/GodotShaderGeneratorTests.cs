using System.Text.RegularExpressions;
using Application.Materials;
using Domain.Models;
using Domain.ValueObjects;
using Xunit;

namespace Application.Tests.Materials;

/// <summary>
/// The exported Godot shader and resource. The contract the game depends on: a spatial
/// shader whose vertex stage displaces only for jelly_wobble, whose fragment stage adds one
/// EMISSION line per fragment effect, that never reaches for screen/depth textures or the
/// engine clock, and a .tres that pins every non-texture uniform.
/// </summary>
public class GodotShaderGeneratorTests
{
    private static readonly DateTime Now = new(2026, 10, 9, 12, 0, 0, DateTimeKind.Utc);

    private const string SpecEffects = """
        {
          "version": 1,
          "effects": [
            { "type": "jelly_wobble", "amplitude": 0.03, "frequency": 1.5, "waveScale": 4.0, "seed": 0,
              "drivers": { "amplitude": { "input": "speed", "scale": 0.02 } } },
            { "type": "rim", "color": "#7CFF2A", "power": 3.0, "intensity": 1.0 },
            { "type": "translucency", "interiorColor": "#2E5A12", "thickness": 0.6 },
            { "type": "emission_pulse", "color": "#CCFF66", "intensity": 0.0, "rate": 2.0,
              "drivers": { "intensity": { "input": "charge", "scale": 4.0 } } }
          ],
          "previewInputs": { "speed": 0, "impulse": 0, "charge": 0 }
        }
        """;

    private static Material Jelly()
    {
        var material = Material.Create("Glow Jelly", MaterialParameters.Create(
            baseColorR: 0.1f, baseColorG: 0.2f, baseColorB: 0.3f, baseColorA: 1f,
            roughness: 0.6f, metallic: 0.1f), Now);
        material.SetEffects(SpecEffects, Now);
        return material;
    }

    private static string ShaderWith(string effectsJson)
    {
        var material = Material.Create("Test", MaterialParameters.Default, Now);
        material.SetEffects(effectsJson, Now);
        return GodotShaderGenerator.WriteShader(material);
    }

    [Fact]
    public void Shader_Starts_With_Shader_Type_Spatial()
    {
        Assert.StartsWith("shader_type spatial;", GodotShaderGenerator.WriteShader(Jelly()));
    }

    [Fact]
    public void JellyWobble_Displaces_The_Vertex_Along_Its_Normal()
    {
        var shader = GodotShaderGenerator.WriteShader(Jelly());

        Assert.Contains("void vertex()", shader);
        Assert.Contains("VERTEX += NORMAL * jelly_d;", shader);
        Assert.Contains("sin(6.2831853 * jelly_frequency * effect_time", shader);
    }

    [Fact]
    public void WithoutJellyWobble_The_Vertex_Is_Left_Alone()
    {
        var shader = ShaderWith("""{"version":1,"effects":[{"type":"rim","color":"#ffffff","power":3,"intensity":1}]}""");

        Assert.Contains("void vertex()", shader);
        Assert.DoesNotContain("VERTEX += NORMAL *", shader);
    }

    [Fact]
    public void Every_Fragment_Effect_Adds_One_Emission_Line()
    {
        // rim + translucency + emission_pulse: three EMISSION += lines, nothing else.
        var all = GodotShaderGenerator.WriteShader(Jelly());
        Assert.Equal(3, Regex.Matches(all, @"EMISSION \+=").Count);

        var rimOnly = ShaderWith("""{"version":1,"effects":[{"type":"rim","color":"#ffffff","power":3,"intensity":1}]}""");
        Assert.Single(Regex.Matches(rimOnly, @"EMISSION \+="));

        var jellyOnly = ShaderWith(
            """{"version":1,"effects":[{"type":"jelly_wobble","amplitude":0.1,"frequency":1,"waveScale":1,"seed":0}]}""");
        Assert.Empty(Regex.Matches(jellyOnly, @"EMISSION \+="));
    }

    [Fact]
    public void The_Shader_Never_Uses_Screen_Depth_Or_Engine_Time()
    {
        // Mobile-safe: the game drives effect_time and the inputs; TIME is never read.
        var shader = GodotShaderGenerator.WriteShader(Jelly());

        Assert.DoesNotContain("SCREEN_TEXTURE", shader);
        Assert.DoesNotContain("DEPTH_TEXTURE", shader);
        Assert.DoesNotContain("TIME", shader);
    }

    [Fact]
    public void The_Shader_Declares_The_Input_And_Per_Parameter_Uniforms()
    {
        var shader = GodotShaderGenerator.WriteShader(Jelly());

        foreach (var uniform in new[]
                 {
                     "effect_time", "input_speed", "input_impulse", "input_charge",
                     "jelly_amplitude", "jelly_frequency", "jelly_wave_scale", "jelly_seed",
                     "rim_power", "rim_intensity",
                     "translucency_thickness",
                     "emission_pulse_intensity", "emission_pulse_rate",
                 })
        {
            Assert.Contains($"uniform float {uniform}", shader);
        }

        foreach (var color in new[] { "rim_color", "translucency_interior_color", "emission_pulse_color" })
            Assert.Contains($"uniform vec3 {color} : source_color", shader);
    }

    [Fact]
    public void Colors_And_Base_Material_Values_Become_Uniform_Defaults()
    {
        var shader = GodotShaderGenerator.WriteShader(Jelly());

        Assert.Contains("uniform vec4 albedo_color : source_color = vec4(0.1, 0.2, 0.3, 1.0);", shader);
        Assert.Contains("uniform float roughness_value : hint_range(0.0, 1.0) = 0.6;", shader);
        Assert.Contains("uniform float metallic_value : hint_range(0.0, 1.0) = 0.1;", shader);
        Assert.Contains("uniform vec3 rim_color : source_color = vec3(0.486275, 1.0, 0.164706);", shader);
        Assert.Contains("uniform vec3 translucency_interior_color : source_color = vec3(0.180392, 0.352941, 0.070588);", shader);
    }

    [Fact]
    public void A_Driven_Parameter_Clamps_Base_Plus_Input_Times_Scale()
    {
        var shader = GodotShaderGenerator.WriteShader(Jelly());

        Assert.Contains(
            "float jelly_amplitude_eff = clamp(jelly_amplitude + input_speed * 0.02, 0.0, 0.5);",
            shader);
        Assert.Contains(
            "float emission_pulse_intensity_eff = clamp(emission_pulse_intensity + input_charge * 4.0, 0.0, 10.0);",
            shader);
    }

    [Fact]
    public void The_Resource_Is_A_ShaderMaterial_Referencing_The_Shader()
    {
        var resource = GodotShaderGenerator.WriteResource(Jelly(), "res://glow-jelly.gdshader");

        Assert.StartsWith("[gd_resource type=\"ShaderMaterial\" load_steps=2 format=3]", resource);
        Assert.Contains("[ext_resource type=\"Shader\" path=\"res://glow-jelly.gdshader\" id=\"1_shader\"]", resource);
        Assert.Contains("shader = ExtResource(\"1_shader\")", resource);
    }

    [Fact]
    public void The_Resource_Sets_Every_Non_Texture_Uniform_To_The_Material_Value()
    {
        var material = Jelly();
        var shader = GodotShaderGenerator.WriteShader(material);
        var resource = GodotShaderGenerator.WriteResource(material, "res://glow-jelly.gdshader");

        var scalarUniforms = Regex.Matches(shader, @"uniform\s+(?:float|vec3|vec4)\s+(\w+)")
            .Select(m => m.Groups[1].Value)
            .ToList();

        Assert.Contains("effect_time", scalarUniforms);
        Assert.Contains("input_speed", scalarUniforms);
        Assert.Contains("input_impulse", scalarUniforms);
        Assert.Contains("input_charge", scalarUniforms);
        Assert.Contains("jelly_amplitude", scalarUniforms);
        Assert.Contains("rim_color", scalarUniforms);
        Assert.Contains("emission_pulse_rate", scalarUniforms);

        foreach (var name in scalarUniforms)
            Assert.Contains($"shader_parameter/{name} = ", resource);

        // The values themselves are the material's, not defaults.
        Assert.Contains("shader_parameter/jelly_amplitude = 0.03", resource);
        Assert.Contains("shader_parameter/rim_color = Color(0.486275, 1.0, 0.164706, 1.0)", resource);
        Assert.Contains("shader_parameter/emission_pulse_intensity = 0.0", resource);
    }

    [Fact]
    public void The_Resource_Leaves_Texture_Uniforms_Unset()
    {
        var material = Jelly();
        var shader = GodotShaderGenerator.WriteShader(material);
        var resource = GodotShaderGenerator.WriteResource(material, "res://glow-jelly.gdshader");

        var textureUniforms = Regex.Matches(shader, @"uniform\s+sampler2D\s+(\w+)")
            .Select(m => m.Groups[1].Value)
            .ToList();

        Assert.Contains("albedo_texture", textureUniforms);
        foreach (var name in textureUniforms)
            Assert.DoesNotContain($"shader_parameter/{name}", resource);
    }
}
