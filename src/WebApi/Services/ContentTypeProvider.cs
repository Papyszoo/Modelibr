namespace WebApi.Services;

public static class ContentTypeProvider
{
    public static string GetContentType(string filePath)
    {
        var extension = Path.GetExtension(filePath).ToLowerInvariant();
        return extension switch
        {
            ".obj" => "text/plain",
            ".fbx" => "application/octet-stream",
            ".dae" => "application/xml",
            ".3ds" => "application/octet-stream",
            ".blend" => "application/octet-stream",
            ".gltf" => "application/json",
            ".glb" => "application/octet-stream",
            _ => "application/octet-stream"
        };
    }
}