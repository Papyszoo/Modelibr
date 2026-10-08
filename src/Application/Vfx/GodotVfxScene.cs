using System.Globalization;
using System.Text;
using System.Text.Json;

namespace Application.Vfx;

/// <summary>
/// Writes a stored v1 definition as a Godot 4 text scene (<c>.tscn</c>, format 3).
///
/// The browser preview (<c>vfxRuntime.ts</c>) is the source of truth for what the numbers
/// mean; this maps each component onto the closest stock Godot node and drives them all
/// from one AnimationPlayer whose "play" animation is the effect timeline.
///
/// <paramref name="assetPaths"/> maps a component id to its copied file, relative to the
/// scene (Godot resolves a relative ext_resource path against the scene's folder, so the
/// exported folder works wherever it is dropped under res://). A mesh or sound component
/// without a path is left out; a particle component without one gets the preview's soft disc.
/// </summary>
internal static class GodotVfxScene
{
    public const int MaxParticles = 5000;
    private const string DiscId = "particle_disc";

    public static string Write(
        string effectName,
        JsonElement definition,
        IReadOnlyDictionary<string, string> assetPaths)
    {
        var ext = new StringBuilder();
        var sub = new StringBuilder();
        var nodes = new StringBuilder();
        var tracks = new List<string>();

        var length = Num(definition, "duration");
        var loop = definition.GetProperty("loop").GetBoolean();
        var discWritten = false;

        foreach (var component in definition.GetProperty("components").EnumerateArray())
        {
            var id = component.GetProperty("id").GetString()!;
            var start = Num(component, "start");
            var end = start + Num(component, "duration");
            var transform = Transform(component);
            assetPaths.TryGetValue(id, out var assetPath);

            switch (component.GetProperty("type").GetString())
            {
                case "particles":
                {
                    var particles = component.GetProperty("particles");
                    string texture;
                    if (assetPath is not null)
                    {
                        ext.Append(ExtResource("Texture2D", assetPath, $"{id}_sprite"));
                        texture = $"ExtResource(\"{id}_sprite\")";
                    }
                    else
                    {
                        if (!discWritten)
                        {
                            sub.Append(DiscTexture());
                            discWritten = true;
                        }

                        texture = $"SubResource(\"{DiscId}\")";
                    }

                    WriteParticles(id, particles, transform, texture, sub, nodes);

                    if (particles.GetProperty("mode").GetString() == "burst")
                        tracks.Add(MethodTrack(id, start, "restart"));
                    else if (Num(particles, "rate") > 0)
                        tracks.Add(WindowTrack($"{id}:emitting", start, end));
                    break;
                }

                case "mesh":
                {
                    if (assetPath is null)
                        break;

                    // Godot imports OBJ as a Mesh resource, every other model format as a scene.
                    if (assetPath.EndsWith(".obj", StringComparison.OrdinalIgnoreCase))
                    {
                        ext.Append(ExtResource("Mesh", assetPath, $"{id}_model"));
                        nodes.Append(Node(id, "type=\"MeshInstance3D\" parent=\".\""));
                        nodes.Append($"mesh = ExtResource(\"{id}_model\")\n");
                    }
                    else
                    {
                        ext.Append(ExtResource("PackedScene", assetPath, $"{id}_model"));
                        nodes.Append(Node(id, $"parent=\".\" instance=ExtResource(\"{id}_model\")"));
                    }

                    nodes.Append(transform).Append("visible = false\n\n");
                    tracks.Add(WindowTrack($"{id}:visible", start, end));

                    var keyTracks = component.TryGetProperty("tracks", out var t) ? t : default;
                    if (TryKeys(keyTracks, "scale", start, out var scale))
                        tracks.Add(ValueTrack($"{id}:scale", scale, v => $"Vector3({F(v)}, {F(v)}, {F(v)})"));
                    if (TryKeys(keyTracks, "rotationY", start, out var rotation))
                        tracks.Add(ValueTrack($"{id}:rotation:y", rotation, v => F(v * Math.PI / 180)));
                    break;
                }

                case "light":
                {
                    var light = component.GetProperty("light");
                    var keyTracks = component.TryGetProperty("tracks", out var t) ? t : default;
                    var hasIntensity = TryKeys(keyTracks, "intensity", start, out var intensity);

                    nodes.Append(Node(id, "type=\"OmniLight3D\" parent=\".\""));
                    nodes.Append(transform).Append("visible = false\n");
                    nodes.Append($"light_color = {Color(light.GetProperty("color").GetString()!, 1)}\n");
                    nodes.Append($"light_energy = {F(hasIntensity ? intensity[0].Value : 1)}\n");
                    nodes.Append($"omni_range = {F(Num(light, "range"))}\n\n");

                    // Hidden outside its window (the preview's intensity 0); energy follows the track inside it.
                    tracks.Add(WindowTrack($"{id}:visible", start, end));
                    if (hasIntensity)
                        tracks.Add(ValueTrack($"{id}:light_energy", intensity, F));
                    break;
                }

                case "sound":
                {
                    if (assetPath is null)
                        break;

                    var volume = Num(component.GetProperty("sound"), "volume");
                    ext.Append(ExtResource("AudioStream", assetPath, $"{id}_stream"));
                    nodes.Append(Node(id, "type=\"AudioStreamPlayer3D\" parent=\".\""));
                    nodes.Append(transform);
                    nodes.Append($"stream = ExtResource(\"{id}_stream\")\n");
                    nodes.Append($"volume_db = {F(volume > 0 ? Math.Max(-80, 20 * Math.Log10(volume)) : -80)}\n\n");
                    tracks.Add(MethodTrack(id, start, "play"));
                    break;
                }
            }
        }

        sub.Append("[sub_resource type=\"Animation\" id=\"play\"]\n");
        sub.Append("resource_name = \"play\"\n");
        sub.Append($"length = {F(length)}\n");
        if (loop)
            sub.Append("loop_mode = 1\n");
        for (var i = 0; i < tracks.Count; i++)
            sub.Append(tracks[i].Replace("tracks/#/", $"tracks/{i}/"));
        sub.Append('\n');

        sub.Append("[sub_resource type=\"AnimationLibrary\" id=\"library\"]\n");
        sub.Append("_data = {\n&\"play\": SubResource(\"play\")\n}\n\n");

        var scene = new StringBuilder();
        scene.Append("[gd_scene format=3]\n\n");
        scene.Append(ext);
        if (ext.Length > 0)
            scene.Append('\n');
        scene.Append(sub);
        scene.Append($"[node name=\"{NodeName(effectName)}\" type=\"Node3D\"]\n\n");
        scene.Append(nodes);
        scene.Append("[node name=\"AnimationPlayer\" type=\"AnimationPlayer\" parent=\".\"]\n");
        scene.Append("libraries = {\n&\"\": SubResource(\"library\")\n}\n");
        scene.Append("autoplay = &\"play\"\n");
        return scene.ToString();
    }

    /// <summary>
    /// Continuous: Godot spreads <c>amount</c> evenly over <c>lifetime</c>, so the preview's
    /// rate becomes rate × lifetime particles. Burst: all <c>count</c> at once.
    /// </summary>
    public static int Amount(JsonElement particles)
    {
        var amount = particles.GetProperty("mode").GetString() == "burst"
            ? particles.GetProperty("count").GetInt32()
            : (int)Math.Ceiling(Num(particles, "rate") * Num(particles, "lifetime"));
        return Math.Clamp(amount, 1, MaxParticles);
    }

    private static void WriteParticles(
        string id, JsonElement p, string transform, string texture, StringBuilder sub, StringBuilder nodes)
    {
        var burst = p.GetProperty("mode").GetString() == "burst";
        var lifetime = Num(p, "lifetime");
        var speed = Num(p, "speed");
        var gravity = Num(p, "gravity");
        var sizeStart = Num(p, "sizeStart");
        var sizeEnd = Num(p, "sizeEnd");
        var size = Math.Max(sizeStart, sizeEnd);

        // Godot's scale curve is a 0..1 multiplier, so the base scale is the larger size.
        var hasScaleCurve = size > 0 && sizeStart != sizeEnd;
        if (hasScaleCurve)
        {
            var from = sizeStart / size;
            var to = sizeEnd / size;
            var slope = to - from;
            sub.Append($"[sub_resource type=\"Curve\" id=\"{id}_size\"]\n");
            sub.Append($"_data = [Vector2(0, {F(from)}), 0.0, {F(slope)}, 0, 1, Vector2(1, {F(to)}), {F(slope)}, 0.0, 1, 0]\n");
            sub.Append("point_count = 2\n\n");
            sub.Append($"[sub_resource type=\"CurveTexture\" id=\"{id}_size_texture\"]\n");
            sub.Append($"curve = SubResource(\"{id}_size\")\n\n");
        }

        sub.Append($"[sub_resource type=\"Gradient\" id=\"{id}_color\"]\n");
        sub.Append("offsets = PackedFloat32Array(0, 1)\n");
        sub.Append($"colors = PackedColorArray({ColorValues(p.GetProperty("colorStart").GetString()!, Num(p, "opacityStart"))}, " +
                   $"{ColorValues(p.GetProperty("colorEnd").GetString()!, Num(p, "opacityEnd"))})\n\n");
        sub.Append($"[sub_resource type=\"GradientTexture1D\" id=\"{id}_color_texture\"]\n");
        sub.Append($"gradient = SubResource(\"{id}_color\")\n\n");

        sub.Append($"[sub_resource type=\"ParticleProcessMaterial\" id=\"{id}_process\"]\n");
        sub.Append("direction = Vector3(0, 1, 0)\n");
        sub.Append($"spread = {F(Num(p, "spread"))}\n");
        sub.Append($"initial_velocity_min = {F(0.75 * speed)}\n");
        sub.Append($"initial_velocity_max = {F(1.25 * speed)}\n");
        sub.Append($"gravity = Vector3(0, {F(gravity)}, 0)\n");
        sub.Append($"scale_min = {F(size)}\n");
        sub.Append($"scale_max = {F(size)}\n");
        if (hasScaleCurve)
            sub.Append($"scale_curve = SubResource(\"{id}_size_texture\")\n");
        sub.Append($"color_ramp = SubResource(\"{id}_color_texture\")\n\n");

        sub.Append($"[sub_resource type=\"StandardMaterial3D\" id=\"{id}_material\"]\n");
        sub.Append("transparency = 1\n");
        if (p.GetProperty("blending").GetString() == "additive")
            sub.Append("blend_mode = 1\n");
        sub.Append("shading_mode = 0\n");
        sub.Append("vertex_color_use_as_albedo = true\n");
        sub.Append($"albedo_texture = {texture}\n");
        sub.Append("billboard_mode = 3\n\n");

        sub.Append($"[sub_resource type=\"QuadMesh\" id=\"{id}_quad\"]\n");
        sub.Append($"material = SubResource(\"{id}_material\")\n\n");

        // Room for the farthest particle, so Godot does not cull a live effect.
        var reach = 1.25 * speed * lifetime + 0.5 * Math.Abs(gravity) * lifetime * lifetime + size;
        nodes.Append(Node(id, "type=\"GPUParticles3D\" parent=\".\""));
        nodes.Append(transform);
        nodes.Append("emitting = false\n");
        nodes.Append($"amount = {Amount(p)}\n");
        nodes.Append($"lifetime = {F(lifetime)}\n");
        if (burst)
        {
            nodes.Append("one_shot = true\n");
            nodes.Append("explosiveness = 1.0\n");
        }

        nodes.Append("local_coords = false\n");
        nodes.Append($"visibility_aabb = AABB({F(-reach)}, {F(-reach)}, {F(-reach)}, {F(2 * reach)}, {F(2 * reach)}, {F(2 * reach)})\n");
        nodes.Append($"process_material = SubResource(\"{id}_process\")\n");
        nodes.Append($"draw_pass_1 = SubResource(\"{id}_quad\")\n\n");
    }

    /// <summary>The preview's untextured particle: white, fading out over the outer rim.</summary>
    private static string DiscTexture() =>
        "[sub_resource type=\"Gradient\" id=\"particle_disc_gradient\"]\n" +
        "offsets = PackedFloat32Array(0.7, 1)\n" +
        "colors = PackedColorArray(1, 1, 1, 1, 1, 1, 1, 0)\n\n" +
        $"[sub_resource type=\"GradientTexture2D\" id=\"{DiscId}\"]\n" +
        "gradient = SubResource(\"particle_disc_gradient\")\n" +
        "fill = 1\n" +
        "fill_from = Vector2(0.5, 0.5)\n" +
        "fill_to = Vector2(1, 0.5)\n\n";

    // ── Animation tracks ("tracks/#/" is numbered when the animation is assembled) ──

    /// <summary>A discrete on/off track: true from <paramref name="start"/> to <paramref name="end"/>.</summary>
    private static string WindowTrack(string path, double start, double end)
    {
        var keys = new List<(double Time, string Value)>();
        if (start > 0)
            keys.Add((0, "false"));
        keys.Add((start, "true"));
        keys.Add((end, "false"));
        return Track("value", path, keys, update: 1);
    }

    private static string ValueTrack(string path, List<(double Time, double Value)> keys, Func<double, string> format) =>
        Track("value", path, keys.Select(k => (k.Time, format(k.Value))).ToList(), update: 0);

    private static string MethodTrack(string path, double time, string method) =>
        Track("method", path, [(time, $"{{\n\"args\": [],\n\"method\": &\"{method}\"\n}}")], update: null);

    private static string Track(string type, string path, List<(double Time, string Value)> keys, int? update)
    {
        var track = new StringBuilder();
        track.Append($"tracks/#/type = \"{type}\"\n");
        track.Append("tracks/#/imported = false\n");
        track.Append("tracks/#/enabled = true\n");
        track.Append($"tracks/#/path = NodePath(\"{path}\")\n");
        track.Append("tracks/#/interp = 1\n");
        track.Append("tracks/#/loop_wrap = false\n");
        track.Append("tracks/#/keys = {\n");
        track.Append($"\"times\": PackedFloat32Array({string.Join(", ", keys.Select(k => F(k.Time)))}),\n");
        track.Append($"\"transitions\": PackedFloat32Array({string.Join(", ", keys.Select(_ => "1"))}),\n");
        if (update is not null)
            track.Append($"\"update\": {update},\n");
        track.Append($"\"values\": [{string.Join(", ", keys.Select(k => k.Value))}]\n");
        track.Append("}\n");
        return track.ToString();
    }

    /// <summary>A component's keyframes moved onto the effect timeline, in time order.</summary>
    private static bool TryKeys(JsonElement tracks, string name, double start, out List<(double Time, double Value)> keys)
    {
        keys = [];
        if (tracks.ValueKind != JsonValueKind.Object || !tracks.TryGetProperty(name, out var array))
            return false;

        keys = array.EnumerateArray()
            .Select(pair => (start + pair[0].GetDouble(), pair[1].GetDouble()))
            .OrderBy(key => key.Item1)
            .ToList();
        return keys.Count > 0;
    }

    // ── Formatting ──

    private static string ExtResource(string type, string path, string id) =>
        $"[ext_resource type=\"{type}\" path=\"{path}\" id=\"{id}\"]\n";

    private static string Node(string name, string attributes) => $"[node name=\"{name}\" {attributes}]\n";

    private static string Transform(JsonElement component)
    {
        if (!component.TryGetProperty("position", out var position) || position.ValueKind != JsonValueKind.Array)
            return string.Empty;

        var p = position.EnumerateArray().Select(v => F(v.GetDouble())).ToArray();
        return $"transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, {p[0]}, {p[1]}, {p[2]})\n";
    }

    private static string Color(string hex, double alpha) => $"Color({ColorValues(hex, alpha)})";

    private static string ColorValues(string hex, double alpha)
    {
        var value = Convert.ToInt32(hex[1..], 16);
        return $"{F(((value >> 16) & 255) / 255.0)}, {F(((value >> 8) & 255) / 255.0)}, {F((value & 255) / 255.0)}, {F(alpha)}";
    }

    /// <summary>Godot forbids . : @ / " % in node names.</summary>
    private static string NodeName(string name)
    {
        var cleaned = new string(name.Trim().Select(c => ".:@/\"%\\".Contains(c) ? '_' : c).ToArray());
        return cleaned.Length == 0 ? "Vfx" : cleaned;
    }

    private static double Num(JsonElement obj, string name) => obj.GetProperty(name).GetDouble();

    private static string F(double value) => value.ToString("0.######", CultureInfo.InvariantCulture);
}
