using Application.Abstractions.Files;
using Application.Abstractions.Services;

namespace Application.Services;

internal sealed class FileUtilityService : IFileUtilityService
{
    public string GetMimeType(string extension)
    {
        return extension.ToLowerInvariant() switch
        {
            ".obj" => "model/obj",
            ".blend" => "application/x-blender",
            ".gltf" => "model/gltf+json",
            ".glb" => "model/gltf-binary",
            ".fbx" => "application/octet-stream",
            ".dae" => "model/vnd.collada+xml",
            ".3ds" => "application/x-3ds",
            ".ply" => "application/octet-stream",
            ".stl" => "model/stl",
            ".jpg" => "image/jpeg",
            ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".tga" => "image/tga",
            ".bmp" => "image/bmp",
            ".mtl" => "text/plain",
            ".max" => "application/octet-stream",
            ".ma" => "application/octet-stream",
            ".mb" => "application/octet-stream",
            _ => "application/octet-stream"
        };
    }

    public async Task<string> CalculateFileHashAsync(IFileUpload file, CancellationToken cancellationToken = default)
    {
        using var sha256 = System.Security.Cryptography.SHA256.Create();
        using var stream = file.OpenRead();
        var hashBytes = await sha256.ComputeHashAsync(stream, cancellationToken);
        return Convert.ToHexString(hashBytes).ToLowerInvariant();
    }
}