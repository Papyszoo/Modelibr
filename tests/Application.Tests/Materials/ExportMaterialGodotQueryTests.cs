using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;
using Application.Abstractions.Repositories;
using Application.Materials;
using Domain.Models;
using Domain.ValueObjects;
using Moq;
using Xunit;

namespace Application.Tests.Materials;

public class ExportMaterialGodotQueryTests
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

    private readonly Mock<IMaterialRepository> _materials = new();

    private ExportMaterialGodotQueryHandler Handler() => new(_materials.Object);

    private static Material GlowJelly()
    {
        var material = Material.Create("Glow Jelly", MaterialParameters.Create(
            baseColorR: 0.1f, baseColorG: 0.2f, baseColorB: 0.3f, baseColorA: 1f,
            roughness: 0.6f, metallic: 0.1f), Now);
        material.SetEffects(SpecEffects, Now);
        return material;
    }

    private void GivenMaterial(int id, Material material) =>
        _materials
            .Setup(r => r.GetByIdAsync(id, It.IsAny<CancellationToken>()))
            .ReturnsAsync(material);

    [Fact]
    public async Task Handle_WhenMaterialIsUnknown_ReturnsMaterialNotFound()
    {
        var result = await Handler().Handle(new ExportMaterialGodotQuery(404), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("MaterialNotFound", result.Error.Code);
    }

    [Fact]
    public async Task Handle_WithEffects_ZipsTheShaderAndResource()
    {
        GivenMaterial(5, GlowJelly());

        var result = await Handler().Handle(new ExportMaterialGodotQuery(5), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("glow-jelly.zip", result.Value.FileName);

        using var zip = new ZipArchive(result.Value.Content);
        Assert.Equal(
            new[] { "glow-jelly.gdshader", "glow-jelly.tres" },
            zip.Entries.Select(e => e.FullName).Order(StringComparer.Ordinal));
    }

    [Fact]
    public async Task Handle_WithEffects_WritesTheEffectShader()
    {
        GivenMaterial(5, GlowJelly());

        var shader = await ReadAsync(await Export(), "glow-jelly.gdshader");

        Assert.StartsWith("shader_type spatial;", shader);
        Assert.Contains("VERTEX += NORMAL * jelly_d;", shader);
        Assert.Equal(3, Regex.Matches(shader, @"EMISSION \+=").Count);
        Assert.DoesNotContain("SCREEN_TEXTURE", shader);
        Assert.DoesNotContain("DEPTH_TEXTURE", shader);
        Assert.DoesNotContain("TIME", shader);
    }

    [Fact]
    public async Task Handle_WithEffects_WritesAResourceSettingEveryNonTextureUniform()
    {
        GivenMaterial(5, GlowJelly());

        var shader = await ReadAsync(await Export(), "glow-jelly.gdshader");
        var resource = await ReadAsync(await Export(), "glow-jelly.tres");

        Assert.Contains("[gd_resource type=\"ShaderMaterial\"", resource);
        Assert.Contains("path=\"res://glow-jelly.gdshader\"", resource);

        var scalarUniforms = Regex.Matches(shader, @"uniform\s+(?:float|vec3|vec4)\s+(\w+)")
            .Select(m => m.Groups[1].Value)
            .ToList();
        Assert.NotEmpty(scalarUniforms);
        foreach (var name in scalarUniforms)
            Assert.Contains($"shader_parameter/{name} = ", resource);
    }

    [Fact]
    public async Task Handle_WithoutEffects_StillExportsTheBaseMaterial()
    {
        var material = Material.Create("Plain Clay", MaterialParameters.Default, Now);
        GivenMaterial(6, material);

        var result = await Handler().Handle(new ExportMaterialGodotQuery(6), CancellationToken.None);
        Assert.True(result.IsSuccess);

        using var zip = new ZipArchive(result.Value.Content);
        var shader = Read(zip, "plain-clay.gdshader");
        var resource = Read(zip, "plain-clay.tres");

        Assert.StartsWith("shader_type spatial;", shader);
        Assert.DoesNotContain("VERTEX += NORMAL *", shader);
        Assert.Empty(Regex.Matches(shader, @"EMISSION \+="));
        Assert.Contains("shader_parameter/roughness_value = ", resource);
    }

    private async Task<Stream> Export()
    {
        var result = await Handler().Handle(new ExportMaterialGodotQuery(5), CancellationToken.None);
        Assert.True(result.IsSuccess);
        return result.Value.Content;
    }

    private static async Task<string> ReadAsync(Stream zipStream, string entryName)
    {
        using var zip = new ZipArchive(zipStream, ZipArchiveMode.Read, leaveOpen: true);
        var entry = zip.GetEntry(entryName);
        Assert.NotNull(entry);
        await using var stream = entry!.Open();
        using var reader = new StreamReader(stream, Encoding.UTF8);
        return await reader.ReadToEndAsync();
    }

    private static string Read(ZipArchive zip, string entryName)
    {
        var entry = zip.GetEntry(entryName);
        Assert.NotNull(entry);
        using var stream = entry!.Open();
        using var reader = new StreamReader(stream, Encoding.UTF8);
        return reader.ReadToEnd();
    }
}
