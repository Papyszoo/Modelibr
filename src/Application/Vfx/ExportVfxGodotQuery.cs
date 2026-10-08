using System.Globalization;
using System.IO.Compression;
using System.Text;
using System.Text.Json;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Storage;
using SharedKernel;

namespace Application.Vfx;

/// <summary>An effect as a Godot 4 drop-in folder, zipped.</summary>
public sealed record ExportVfxGodotQuery(int Id) : IQuery<VfxGodotExport>;

/// <summary>The zip, positioned at its start; disposing it deletes the temporary file.</summary>
public sealed record VfxGodotExport(string FileName, Stream Content);

/// <summary>
/// Builds <c>&lt;slug&gt;/&lt;slug&gt;.tscn</c>, <c>&lt;slug&gt;/README.txt</c> and the
/// referenced library files under <c>&lt;slug&gt;/assets/</c>, read from the same stored
/// files <c>/files/{id}</c> serves. A reference that no longer resolves leaves its node
/// out and is named in the README instead of failing the export.
/// </summary>
internal sealed class ExportVfxGodotQueryHandler : IQueryHandler<ExportVfxGodotQuery, VfxGodotExport>
{
    private static readonly string[] GodotModelFormats = [".glb", ".gltf", ".fbx", ".obj"];
    private static readonly string[] GodotAudioFormats = [".wav", ".ogg", ".mp3"];

    private readonly IVfxRepository _vfx;
    private readonly IModelRepository _models;
    private readonly IModelVersionRepository _versions;
    private readonly IModelVersionAuxiliaryFileRepository _auxiliaries;
    private readonly ISoundRepository _sounds;
    private readonly ISpriteRepository _sprites;
    private readonly IUploadPathProvider _paths;

    public ExportVfxGodotQueryHandler(
        IVfxRepository vfx,
        IModelRepository models,
        IModelVersionRepository versions,
        IModelVersionAuxiliaryFileRepository auxiliaries,
        ISoundRepository sounds,
        ISpriteRepository sprites,
        IUploadPathProvider paths)
    {
        _vfx = vfx;
        _models = models;
        _versions = versions;
        _auxiliaries = auxiliaries;
        _sounds = sounds;
        _sprites = sprites;
        _paths = paths;
    }

    public async Task<Result<VfxGodotExport>> Handle(ExportVfxGodotQuery query, CancellationToken cancellationToken)
    {
        var vfx = await _vfx.GetByIdAsync(query.Id, cancellationToken);
        if (vfx is null)
            return Result.Failure<VfxGodotExport>(new Error("VfxNotFound", $"Vfx with ID {query.Id} was not found."));

        using var document = JsonDocument.Parse(vfx.DefinitionJson);
        var definition = document.RootElement;
        var slug = Slug(vfx.Name, vfx.Id);

        // Zip entry (relative to the slug folder) -> file on disk.
        var files = new Dictionary<string, string>(StringComparer.Ordinal);
        var assetPaths = new Dictionary<string, string>(StringComparer.Ordinal);
        var lines = new List<string>();
        var notes = new List<string>();

        foreach (var component in definition.GetProperty("components").EnumerateArray())
        {
            var id = component.GetProperty("id").GetString()!;
            var type = component.GetProperty("type").GetString()!;
            var start = component.GetProperty("start").GetDouble();
            var window = string.Create(CultureInfo.InvariantCulture,
                $"{id} ({type}, {start:0.###}-{start + component.GetProperty("duration").GetDouble():0.###} s)");

            switch (type)
            {
                case "particles":
                {
                    var particles = component.GetProperty("particles");
                    var burst = particles.GetProperty("mode").GetString() == "burst";
                    var line = $"{window}: GPUParticles3D, {(burst ? "burst" : "continuous")}, {GodotVfxScene.Amount(particles)} particles";

                    if (particles.TryGetProperty("spriteId", out var spriteElement)
                        && spriteElement.ValueKind == JsonValueKind.Number)
                    {
                        var spriteId = spriteElement.GetInt32();
                        var sprite = await _sprites.GetByIdAsync(spriteId, cancellationToken);
                        var path = sprite is null ? null : Copy($"assets/sprite-{spriteId}", sprite.File, null, files);
                        if (path is null)
                        {
                            notes.Add($"{id}: sprite {spriteId} is no longer in the library; the default disc is used.");
                        }
                        else
                        {
                            assetPaths[id] = path;
                            line += $", sprite {path}";
                        }
                    }

                    lines.Add(line);
                    break;
                }

                case "mesh":
                {
                    var path = await CopyModelAsync(component.GetProperty("mesh"), files, cancellationToken);
                    if (path is null)
                    {
                        notes.Add($"{id}: its model has no file left in the library; the mesh was left out.");
                        break;
                    }

                    assetPaths[id] = path;
                    lines.Add($"{window}: {path}, shown only while it plays");
                    if (!GodotModelFormats.Contains(Path.GetExtension(path), StringComparer.OrdinalIgnoreCase))
                        notes.Add($"{id}: Godot does not import {Path.GetExtension(path)} out of the box; convert {path} to glTF.");
                    if (component.TryGetProperty("tracks", out var tracks) && tracks.TryGetProperty("opacity", out _))
                        notes.Add($"{id}: the opacity track is not exported - an imported model's materials cannot be faded generically.");
                    break;
                }

                case "light":
                    lines.Add($"{window}: OmniLight3D, energy from the intensity track");
                    break;

                case "sound":
                {
                    var soundId = component.GetProperty("sound").GetProperty("soundId").GetInt32();
                    var sound = await _sounds.GetByIdAsync(soundId, cancellationToken);
                    var path = sound is null ? null : Copy($"assets/sound-{soundId}", sound.File, null, files);
                    if (path is null)
                    {
                        notes.Add($"{id}: sound {soundId} is no longer in the library; the sound was left out.");
                        break;
                    }

                    assetPaths[id] = path;
                    lines.Add($"{window}: AudioStreamPlayer3D playing {path}");
                    if (!GodotAudioFormats.Contains(Path.GetExtension(path), StringComparer.OrdinalIgnoreCase))
                        notes.Add($"{id}: Godot imports WAV, Ogg Vorbis and MP3; convert {path}.");
                    break;
                }
            }
        }

        var scene = GodotVfxScene.Write(vfx.Name, definition, assetPaths);
        var readme = Readme(vfx.Name, slug, definition, lines, notes);

        var stream = new FileStream(
            Path.GetTempFileName(), FileMode.Create, FileAccess.ReadWrite, FileShare.None, 81920, FileOptions.DeleteOnClose);
        using (var zip = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            await WriteTextAsync(zip, $"{slug}/{slug}.tscn", scene, cancellationToken);
            await WriteTextAsync(zip, $"{slug}/README.txt", readme, cancellationToken);
            foreach (var (entry, source) in files)
                zip.CreateEntryFromFile(source, $"{slug}/{entry}", CompressionLevel.Optimal);
        }

        stream.Position = 0;
        return Result.Success(new VfxGodotExport($"{slug}.zip", stream));
    }

    /// <summary>
    /// The pinned version, or the model's active one when none is pinned; its file is
    /// picked by the same rule the scene resource resolver uses, auxiliaries alongside.
    /// </summary>
    private async Task<string?> CopyModelAsync(
        JsonElement mesh, Dictionary<string, string> files, CancellationToken cancellationToken)
    {
        var modelId = mesh.GetProperty("modelId").GetInt32();
        int? versionId = mesh.TryGetProperty("versionId", out var pinned) && pinned.ValueKind == JsonValueKind.Number
            ? pinned.GetInt32()
            : (await _models.GetIdentitiesAsync([modelId], cancellationToken)).FirstOrDefault()?.ActiveVersionId;
        if (versionId is null)
            return null;

        var version = (await _versions.GetWithFilesByIdsAsync([versionId.Value], cancellationToken))
            .FirstOrDefault(candidate => candidate.ModelId == modelId);
        var file = version?.Files.OrderBy(f => f.Id).FirstOrDefault(f => f.FileType.IsRenderable)
                   ?? version?.Files.OrderBy(f => f.Id).FirstOrDefault();
        if (file is null)
            return null;

        var folder = $"assets/model-{versionId}";
        var path = Copy(folder, file, null, files);
        if (path is null)
            return null;

        foreach (var auxiliary in await _auxiliaries.GetForVersionAsync(versionId.Value, cancellationToken))
            Copy(folder, auxiliary.File, auxiliary.RelativePath, files);

        return path;
    }

    /// <summary>Queues a stored file for the zip; null when it is missing on disk.</summary>
    private string? Copy(string folder, Domain.Models.File file, string? relativePath, Dictionary<string, string> files)
    {
        var source = Path.Combine(_paths.UploadRootPath, file.FilePath);
        if (!System.IO.File.Exists(source))
            return null;

        var entry = $"{folder}/{relativePath ?? SafeFileName(file.OriginalFileName)}";
        files.TryAdd(entry, source);
        return entry;
    }

    private static async Task WriteTextAsync(ZipArchive zip, string name, string text, CancellationToken cancellationToken)
    {
        await using var writer = zip.CreateEntry(name).Open();
        await writer.WriteAsync(new UTF8Encoding(false).GetBytes(text), cancellationToken);
    }

    private static string Readme(
        string name, string slug, JsonElement definition, List<string> lines, List<string> notes)
    {
        var duration = definition.GetProperty("duration").GetDouble();
        var loop = definition.GetProperty("loop").GetBoolean();
        var text = new StringBuilder();
        text.AppendLine($"{name} - Godot 4 export from Modelibr");
        text.AppendLine();
        text.AppendLine($"Copy the {slug} folder anywhere into a Godot 4 project and open or instance {slug}.tscn.");
        text.AppendLine("Paths in the scene are relative to it, so the folder can be moved as a whole.");
        text.AppendLine(string.Create(CultureInfo.InvariantCulture,
            $"Its AnimationPlayer autoplays \"play\" ({duration:0.###} s, {(loop ? "looping" : "once")}); play it again to replay the effect."));
        text.AppendLine();
        text.AppendLine("Components:");
        foreach (var line in lines)
            text.AppendLine($"- {line}");
        if (lines.Count == 0)
            text.AppendLine("- none");
        text.AppendLine();
        text.AppendLine("Limitations:");
        text.AppendLine("- Particles use Godot's own randomness and spread distribution, so they match the preview's");
        text.AppendLine("  counts, timing, speeds, cone, gravity, size and colour ramps, not particle for particle.");
        text.AppendLine("  A continuous rate is rounded up to whole particles per lifetime.");
        foreach (var note in notes)
            text.AppendLine($"- {note}");
        return text.ToString();
    }

    private static string Slug(string name, int id)
    {
        var slug = new StringBuilder();
        foreach (var c in name.ToLowerInvariant())
        {
            if (c is >= 'a' and <= 'z' or >= '0' and <= '9')
                slug.Append(c);
            else if (slug.Length > 0 && slug[^1] != '-')
                slug.Append('-');
        }

        var result = slug.ToString().Trim('-');
        if (result.Length > 60)
            result = result[..60].TrimEnd('-');
        return result.Length == 0 ? $"vfx-{id}" : result;
    }

    /// <summary>Keeps a stored name readable while making it safe inside a quoted scene path.</summary>
    private static string SafeFileName(string name)
    {
        var safe = new string(name.Select(c => char.IsLetterOrDigit(c) || c is '.' or '-' or '_' or ' ' ? c : '_').ToArray()).Trim();
        return safe.Length == 0 ? "file" : safe;
    }
}
