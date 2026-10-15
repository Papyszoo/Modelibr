using System.IO.Compression;
using System.Text;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using SharedKernel;

namespace Application.Materials;

/// <summary>A material as a Godot 4 ShaderMaterial drop-in, zipped.</summary>
public sealed record ExportMaterialGodotQuery(int Id) : IQuery<MaterialGodotExport>;

/// <summary>The zip, positioned at its start; disposing it deletes the temporary file.</summary>
public sealed record MaterialGodotExport(string FileName, Stream Content);

/// <summary>
/// Builds <c>&lt;slug&gt;.gdshader</c> and <c>&lt;slug&gt;.tres</c> from a material's
/// parameters and effects document, following the <c>/vfx/{id}/export/godot</c> shape.
/// The shader is Mobile-renderer safe (no screen or depth textures, no TIME - the game
/// drives <c>effect_time</c> and the three input uniforms), and the resource is a
/// ShaderMaterial referencing it with every material and effect value pinned.
/// </summary>
internal sealed class ExportMaterialGodotQueryHandler : IQueryHandler<ExportMaterialGodotQuery, MaterialGodotExport>
{
    private readonly IMaterialRepository _materials;

    public ExportMaterialGodotQueryHandler(IMaterialRepository materials)
    {
        _materials = materials;
    }

    public async Task<Result<MaterialGodotExport>> Handle(
        ExportMaterialGodotQuery query,
        CancellationToken cancellationToken)
    {
        var material = await _materials.GetByIdAsync(query.Id, cancellationToken);
        if (material is null)
        {
            return Result.Failure<MaterialGodotExport>(
                new Error("MaterialNotFound", $"Material with ID {query.Id} was not found."));
        }

        var slug = Slug(material.Name, material.Id);
        var shader = GodotShaderGenerator.WriteShader(material);
        var resource = GodotShaderGenerator.WriteResource(material, $"res://{slug}.gdshader");

        var stream = new FileStream(
            Path.GetTempFileName(), FileMode.Create, FileAccess.ReadWrite, FileShare.None, 81920, FileOptions.DeleteOnClose);
        using (var zip = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            await WriteTextAsync(zip, $"{slug}.gdshader", shader, cancellationToken);
            await WriteTextAsync(zip, $"{slug}.tres", resource, cancellationToken);
        }

        stream.Position = 0;
        return Result.Success(new MaterialGodotExport($"{slug}.zip", stream));
    }

    private static async Task WriteTextAsync(ZipArchive zip, string name, string text, CancellationToken cancellationToken)
    {
        await using var writer = zip.CreateEntry(name).Open();
        await writer.WriteAsync(new UTF8Encoding(false).GetBytes(text), cancellationToken);
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
        return result.Length == 0 ? $"material-{id}" : result;
    }
}
