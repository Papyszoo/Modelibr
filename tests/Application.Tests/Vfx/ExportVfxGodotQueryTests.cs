using System.IO.Compression;
using System.Text.Json;
using Application.Abstractions.Repositories;
using Application.Abstractions.Storage;
using Application.Models;
using Application.Vfx;
using Domain.Models;
using Domain.ValueObjects;
using Moq;
using Xunit;

namespace Application.Tests.Vfx;

public sealed class ExportVfxGodotQueryTests : IDisposable
{
    private static readonly DateTime Now = new(2026, 10, 8, 12, 0, 0, DateTimeKind.Utc);

    private const string AllComponents = """
        {"version":1,"duration":3,"loop":true,"components":[
          {"id":"sparks","type":"particles","name":"Sparks","start":0.5,"duration":1,"position":[0,1,0],
           "particles":{"mode":"continuous","rate":30,"count":10,"lifetime":0.8,"speed":2,"spread":25,
             "gravity":-4,"sizeStart":0.2,"sizeEnd":0.05,"colorStart":"#ff8800","colorEnd":"#ff0000",
             "opacityStart":1,"opacityEnd":0,"blending":"additive","spriteId":7,"seed":3}},
          {"id":"debris","type":"particles","name":"Debris","start":0,"duration":0.5,
           "particles":{"mode":"burst","rate":0,"count":40,"lifetime":1.5,"speed":3,"spread":60,
             "gravity":-9.8,"sizeStart":0.1,"sizeEnd":0.1,"colorStart":"#888888","colorEnd":"#444444",
             "opacityStart":1,"opacityEnd":1,"blending":"normal","spriteId":null,"seed":1}},
          {"id":"rock","type":"mesh","name":"Rock","start":0,"duration":2,
           "mesh":{"modelId":12,"versionId":34},
           "tracks":{"scale":[[1,1],[0,0.5]],"rotationY":[[0,0],[2,90]],"opacity":[[0,1],[2,0]]}},
          {"id":"flash","type":"light","name":"Flash","start":0.25,"duration":0.5,"position":[0,0.5,0],
           "light":{"color":"#ffffff","range":5},"tracks":{"intensity":[[0,4],[0.5,0]]}},
          {"id":"boom","type":"sound","name":"Boom","start":0.25,"duration":1,
           "sound":{"soundId":9,"volume":0.5}}]}
        """;

    private const string GroundShapes = """
        {"version":1,"duration":3,"loop":false,"components":[
          {"id":"mist","type":"particles","name":"Mist","start":0,"duration":2,
           "emitter":{"shape":"disc","radius":1.5},
           "particles":{"mode":"continuous","rate":10,"lifetime":1,"speed":1,"spread":20,
             "gravity":0,"sizeStart":0.1,"sizeEnd":0.1,"colorStart":"#ffffff","colorEnd":"#000000",
             "opacityStart":1,"opacityEnd":0,"blending":"normal","seed":1},
           "tracks":{"radius":[[0,0.5],[2,1.5]]}},
          {"id":"smoke","type":"particles","name":"Smoke","start":0,"duration":2,
           "emitter":{"shape":"ring","innerRadius":0.5,"outerRadius":1.5},
           "particles":{"mode":"burst","rate":0,"count":10,"lifetime":1,"speed":1,"spread":20,
             "gravity":0,"sizeStart":0.1,"sizeEnd":0.1,"colorStart":"#ffffff","colorEnd":"#000000",
             "opacityStart":1,"opacityEnd":0,"blending":"normal","seed":2},
           "tracks":{"radius":[[0,1.5]]}},
          {"id":"pool","type":"mesh","name":"Pool","start":0,"duration":2,
           "mesh":{"kind":"disc","radius":1.5},
           "tracks":{"radius":[[0,0.5],[2,1.5]]}},
          {"id":"rim","type":"mesh","name":"Rim","start":1,"duration":2,
           "mesh":{"kind":"ring","innerRadius":0.5,"outerRadius":1.5}}]}
        """;

    private readonly string _root = Path.Combine(Path.GetTempPath(), $"vfx-export-{Guid.NewGuid():N}");
    private readonly Mock<IVfxRepository> _vfx = new();
    private readonly Mock<IModelRepository> _models = new();
    private readonly Mock<IModelVersionRepository> _versions = new();
    private readonly Mock<IModelVersionAuxiliaryFileRepository> _auxiliaries = new();
    private readonly Mock<ISoundRepository> _sounds = new();
    private readonly Mock<ISpriteRepository> _sprites = new();
    private readonly Mock<IUploadPathProvider> _paths = new();

    public ExportVfxGodotQueryTests()
    {
        _paths.Setup(p => p.UploadRootPath).Returns(_root);

        var model = StoredFile(101, "Rock Model.gltf", FileType.Gltf);
        var version = ModelVersion.Create(12, 1, null, Now).WithId(34);
        version.AddFile(model);
        _versions.Setup(r => r.GetWithFilesByIdsAsync(It.IsAny<IReadOnlyCollection<int>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([version]);
        _auxiliaries.Setup(r => r.GetForVersionAsync(34, It.IsAny<CancellationToken>()))
            .ReturnsAsync([ModelVersionAuxiliaryFile.Create(34, StoredFile(102, "rock.bin", FileType.Other), "buffers/rock.bin", Now)]);
        _models.Setup(r => r.GetIdentitiesAsync(It.IsAny<IReadOnlyCollection<int>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync([new ModelIdentity(12, "Rock", 34)]);

        _sprites.Setup(r => r.GetByIdAsync(7, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Sprite.Create("Spark", StoredFile(201, "spark.png", FileType.Sprite), SpriteType.Static, Now).WithId(7));
        _sounds.Setup(r => r.GetByIdAsync(9, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Sound.Create("Boom", StoredFile(301, "boom.wav", FileType.Wav), 1.2, null, Now).WithId(9));
    }

    public void Dispose()
    {
        if (Directory.Exists(_root))
            Directory.Delete(_root, recursive: true);
    }

    [Fact]
    public void Definition_UsedByTheseTests_IsValid()
    {
        Assert.Empty(VfxDefinition.Validate(JsonSerializer.Deserialize<JsonElement>(AllComponents)));
    }

    [Fact]
    public async Task Handle_WhenEffectIsUnknown_ReturnsVfxNotFound()
    {
        var result = await Handler().Handle(new ExportVfxGodotQuery(404), CancellationToken.None);

        Assert.True(result.IsFailure);
        Assert.Equal("VfxNotFound", result.Error.Code);
    }

    [Fact]
    public async Task Handle_WithOneOfEachComponent_ZipsSceneReadmeAndReferencedFiles()
    {
        GivenEffect(AllComponents);

        var result = await Handler().Handle(new ExportVfxGodotQuery(5), CancellationToken.None);

        Assert.True(result.IsSuccess);
        Assert.Equal("fireball-v2.zip", result.Value.FileName);
        using var zip = new ZipArchive(result.Value.Content);
        Assert.Equal(
            new[]
            {
                "fireball-v2/README.txt",
                "fireball-v2/assets/model-34/Rock Model.gltf",
                "fireball-v2/assets/model-34/buffers/rock.bin",
                "fireball-v2/assets/sound-9/boom.wav",
                "fireball-v2/assets/sprite-7/spark.png",
                "fireball-v2/fireball-v2.tscn",
            },
            zip.Entries.Select(e => e.FullName).Order(StringComparer.Ordinal));
        Assert.Equal("bytes of 102", Read(zip, "fireball-v2/assets/model-34/buffers/rock.bin"));

        var readme = Read(zip, "fireball-v2/README.txt");
        Assert.Contains("rock: the opacity track is not exported", readme);
        Assert.Contains("looping", readme);
    }

    [Fact]
    public async Task Handle_WithOneOfEachComponent_WritesNodesResourcesAndTracks()
    {
        GivenEffect(AllComponents);

        var scene = await ExportScene();

        Assert.StartsWith("[gd_scene format=3]", scene);
        Assert.Contains("[node name=\"Fireball v2\" type=\"Node3D\"]", scene);

        // Particles: one textured additive continuous emitter, one untextured normal burst.
        Assert.Contains("[ext_resource type=\"Texture2D\" path=\"assets/sprite-7/spark.png\" id=\"sparks_sprite\"]", scene);
        Assert.Contains("[node name=\"sparks\" type=\"GPUParticles3D\" parent=\".\"]", scene);
        Assert.Contains("[sub_resource type=\"ParticleProcessMaterial\" id=\"sparks_process\"]", scene);
        Assert.Contains("[sub_resource type=\"GradientTexture1D\" id=\"sparks_color_texture\"]", scene);
        Assert.Contains("colors = PackedColorArray(1, 0.533333, 0, 1, 1, 0, 0, 0)", scene);
        Assert.Contains("initial_velocity_min = 1.5\ninitial_velocity_max = 2.5\ngravity = Vector3(0, -4, 0)", scene);
        Assert.Contains("scale_min = 0.2\nscale_max = 0.2\nscale_curve = SubResource(\"sparks_size_texture\")", scene);
        Assert.Contains("[sub_resource type=\"QuadMesh\" id=\"sparks_quad\"]", scene);
        Assert.Contains("transparency = 1\nblend_mode = 1\nshading_mode = 0\nvertex_color_use_as_albedo = true\nalbedo_texture = ExtResource(\"sparks_sprite\")\nbillboard_mode = 3", scene);
        Assert.Contains("transparency = 1\nshading_mode = 0\nvertex_color_use_as_albedo = true\nalbedo_texture = SubResource(\"particle_disc\")", scene);
        Assert.Contains("transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0)\nemitting = false\namount = 24\nlifetime = 0.8\nlocal_coords = false", scene);
        Assert.Contains("emitting = false\namount = 40\nlifetime = 1.5\none_shot = true\nexplosiveness = 1.0\nlocal_coords = false", scene);

        // Mesh, light and sound.
        Assert.Contains("[ext_resource type=\"PackedScene\" path=\"assets/model-34/Rock Model.gltf\" id=\"rock_model\"]", scene);
        Assert.Contains("[node name=\"rock\" parent=\".\" instance=ExtResource(\"rock_model\")]", scene);
        Assert.Contains("[node name=\"flash\" type=\"OmniLight3D\" parent=\".\"]", scene);
        Assert.Contains("light_color = Color(1, 1, 1, 1)\nlight_energy = 4\nomni_range = 5", scene);
        Assert.Contains("[ext_resource type=\"AudioStream\" path=\"assets/sound-9/boom.wav\" id=\"boom_stream\"]", scene);
        Assert.Contains("[node name=\"boom\" type=\"AudioStreamPlayer3D\" parent=\".\"]", scene);
        Assert.Contains("volume_db = -6.0206", scene);

        // The timeline.
        Assert.Contains("resource_name = \"play\"\nlength = 3\nloop_mode = 1", scene);
        Assert.Contains("autoplay = &\"play\"", scene);
        AssertTrack(scene, "sparks:emitting", "PackedFloat32Array(0, 0.5, 1.5)", "\"update\": 1", "[false, true, false]");
        AssertTrack(scene, "debris", "PackedFloat32Array(0)", "&\"restart\"");
        AssertTrack(scene, "rock:visible", "PackedFloat32Array(0, 2)", "[true, false]");
        AssertTrack(scene, "rock:scale", "PackedFloat32Array(0, 1)", "\"update\": 0",
            "[Vector3(0.5, 0.5, 0.5), Vector3(1, 1, 1)]");
        AssertTrack(scene, "rock:rotation:y", "PackedFloat32Array(0, 2)", "[0, 1.570796]");
        AssertTrack(scene, "flash:visible", "PackedFloat32Array(0, 0.25, 0.75)", "[false, true, false]");
        AssertTrack(scene, "flash:light_energy", "PackedFloat32Array(0.25, 0.75)", "[4, 0]");
        AssertTrack(scene, "boom", "PackedFloat32Array(0.25)", "&\"play\"");
        Assert.DoesNotContain("opacity", scene);
    }

    [Fact]
    public void GroundShapesDefinition_UsedByTheseTests_IsValid()
    {
        Assert.Empty(VfxDefinition.Validate(JsonSerializer.Deserialize<JsonElement>(GroundShapes)));
    }

    [Fact]
    public async Task Handle_WithGroundShapes_WritesRingEmittersFlatPrimitivesAndRadiusTracks()
    {
        GivenEffect(GroundShapes);

        var scene = await ExportScene();

        // A disc emitter is Godot's ring shape with a zero inner radius; a ring keeps both radii.
        Assert.Contains(
            "emission_shape = 6\nemission_ring_axis = Vector3(0, 1, 0)\nemission_ring_height = 0\n" +
            "emission_ring_inner_radius = 0\nemission_ring_radius = 1.5",
            scene);
        Assert.Contains("emission_ring_inner_radius = 0.5\nemission_ring_radius = 1.5", scene);

        // The radius track animates the process material's ring radii.
        AssertTrack(scene, "mist:process_material:emission_ring_radius", "PackedFloat32Array(0, 2)", "[0.5, 1.5]");
        AssertTrack(scene, "smoke:process_material:emission_ring_radius", "PackedFloat32Array(0)", "[1.5]");
        AssertTrack(scene, "smoke:process_material:emission_ring_inner_radius", "PackedFloat32Array(0)", "[0.5]");

        // A disc primitive is a flat CylinderMesh; its radius track scales x/z only.
        Assert.Contains("[sub_resource type=\"CylinderMesh\" id=\"pool_mesh\"]", scene);
        Assert.Contains("top_radius = 1.5\nbottom_radius = 1.5\nheight = 0.002\nradial_segments = 64\nrings = 1", scene);
        AssertTrack(scene, "pool:scale", "PackedFloat32Array(0, 2)",
            "[Vector3(0.333333, 1, 0.333333), Vector3(1, 1, 1)]");

        // A ring primitive is a TorusMesh squashed on y; no library file is copied.
        Assert.Contains("[sub_resource type=\"TorusMesh\" id=\"rim_mesh\"]", scene);
        Assert.Contains("inner_radius = 0.5\nouter_radius = 1.5", scene);
        Assert.Contains("[node name=\"rim\" type=\"MeshInstance3D\" parent=\".\"]", scene);
        Assert.Contains("transform = Transform3D(1, 0, 0, 0, 0.02, 0, 0, 0, 1, 0, 0, 0)", scene);
        Assert.DoesNotContain("PackedScene", scene);
        Assert.DoesNotContain("assets/model", scene);
    }

    [Fact]
    public async Task Handle_WithAColouredPrimitive_WritesItsMaterial()
    {
        const string json = """
            {"version":1,"duration":2,"loop":false,"components":[
              {"id":"pool","type":"mesh","name":"Pool","start":0,"duration":2,
               "mesh":{"kind":"disc","radius":1.5,"color":"#5aa469","emissiveIntensity":4}}]}
            """;
        Assert.Empty(VfxDefinition.Validate(JsonSerializer.Deserialize<JsonElement>(json)));
        GivenEffect(json);

        var scene = await ExportScene();

        // Section 7: albedo from the colour, emission from colour * intensity.
        Assert.Contains("[sub_resource type=\"StandardMaterial3D\" id=\"pool_material\"]", scene);
        Assert.Contains("albedo_color = Color(0.352941, 0.643137, 0.411765, 1)", scene);
        Assert.Contains("emission_enabled = true", scene);
        Assert.Contains("emission = Color(0.352941, 0.643137, 0.411765, 1)", scene);
        Assert.Contains("emission_energy_multiplier = 4", scene);
        Assert.Contains("material = SubResource(\"pool_material\")", scene);
    }

    [Fact]
    public async Task Handle_WithAnUncolouredPrimitive_WritesTheDefaultGrey()
    {
        GivenEffect(GroundShapes);

        var scene = await ExportScene();

        // An effect authored before section 7 keeps the grey, unlit look.
        Assert.Contains("albedo_color = Color(0.541176, 0.576471, 0.65098, 1)", scene);
        Assert.DoesNotContain("emission_enabled", scene);
    }

    [Theory]
    [InlineData("continuous", 30, 10, 0.8, 24)]
    [InlineData("continuous", 7, 10, 1, 7)]
    [InlineData("continuous", 2000, 10, 10, 5000)]
    [InlineData("burst", 30, 40, 0.8, 40)]
    public void Amount_FollowsModeAndIsCapped(string mode, double rate, int count, double lifetime, int expected)
    {
        var particles = JsonSerializer.Deserialize<JsonElement>(
            $$"""{"mode":"{{mode}}","rate":{{rate}},"count":{{count}},"lifetime":{{lifetime.ToString(System.Globalization.CultureInfo.InvariantCulture)}}}""");

        Assert.Equal(expected, GodotVfxScene.Amount(particles));
    }

    [Fact]
    public async Task Handle_WhenSoundIsGone_LeavesItOutAndSaysSo()
    {
        _sounds.Setup(r => r.GetByIdAsync(9, It.IsAny<CancellationToken>())).ReturnsAsync((Sound?)null);
        GivenEffect(AllComponents);

        var result = await Handler().Handle(new ExportVfxGodotQuery(5), CancellationToken.None);

        using var zip = new ZipArchive(result.Value.Content);
        Assert.DoesNotContain("AudioStreamPlayer3D", Read(zip, "fireball-v2/fireball-v2.tscn"));
        Assert.DoesNotContain(zip.Entries, e => e.FullName.Contains("sound-9"));
        Assert.Contains("boom: sound 9 is no longer in the library", Read(zip, "fireball-v2/README.txt"));
    }

    private ExportVfxGodotQueryHandler Handler() => new(
        _vfx.Object, _models.Object, _versions.Object, _auxiliaries.Object,
        _sounds.Object, _sprites.Object, _paths.Object);

    private void GivenEffect(string definitionJson) =>
        _vfx.Setup(r => r.GetByIdAsync(5, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Domain.Models.Vfx.Create("Fireball v2", null, definitionJson, Now).WithId(5));

    private async Task<string> ExportScene()
    {
        var result = await Handler().Handle(new ExportVfxGodotQuery(5), CancellationToken.None);
        Assert.True(result.IsSuccess);
        using var zip = new ZipArchive(result.Value.Content);
        return Read(zip, "fireball-v2/fireball-v2.tscn");
    }

    private Domain.Models.File StoredFile(int id, string name, FileType type)
    {
        var relative = Path.Combine("stored", id.ToString());
        Directory.CreateDirectory(Path.Combine(_root, "stored"));
        System.IO.File.WriteAllText(Path.Combine(_root, relative), $"bytes of {id}");

        return Domain.Models.File.Create(
            name, $"stored-{id}", relative, "application/octet-stream", type, 10,
            id.ToString("x").PadLeft(64, '0'), Now).WithId(id);
    }

    private static string Read(ZipArchive zip, string entry)
    {
        using var reader = new StreamReader(zip.GetEntry(entry)!.Open());
        return reader.ReadToEnd();
    }

    /// <summary>The track whose path is <paramref name="path"/> contains every fragment.</summary>
    private static void AssertTrack(string scene, string path, params string[] fragments)
    {
        var marker = $"path = NodePath(\"{path}\")";
        var start = scene.IndexOf(marker, StringComparison.Ordinal);
        Assert.True(start >= 0, $"No track for {path}.");
        var block = scene[start..scene.IndexOf("\n}\n", start, StringComparison.Ordinal)];
        foreach (var fragment in fragments)
            Assert.Contains(fragment, block);
    }
}
