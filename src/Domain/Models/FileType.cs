namespace Domain.Models;

public enum FileType
{
    Unknown = 0,
    
    // Renderable 3D model files that can be displayed in the frontend
    Obj = 1,
    Fbx = 2,
    Gltf = 3,
    Glb = 4,
    
    // Project files that are downloadable only
    Blend = 10,
    Max = 11,
    Maya = 12,
    
    // Other downloadable files
    Texture = 20,
    Material = 21,
    Other = 99
}

public static class FileTypeExtensions
{
    public static bool IsRenderable(this FileType fileType)
    {
        return fileType switch
        {
            FileType.Obj => true,
            FileType.Fbx => true,
            FileType.Gltf => true,
            FileType.Glb => true,
            _ => false
        };
    }
    
    public static FileType GetFileTypeFromExtension(string extension)
    {
        return extension.ToLowerInvariant() switch
        {
            ".obj" => FileType.Obj,
            ".fbx" => FileType.Fbx,
            ".gltf" => FileType.Gltf,
            ".glb" => FileType.Glb,
            ".blend" => FileType.Blend,
            ".max" => FileType.Max,
            ".ma" => FileType.Maya,
            ".mb" => FileType.Maya,
            ".jpg" => FileType.Texture,
            ".jpeg" => FileType.Texture,
            ".png" => FileType.Texture,
            ".tga" => FileType.Texture,
            ".bmp" => FileType.Texture,
            ".mtl" => FileType.Material,
            _ => FileType.Other
        };
    }
}