using SharedKernel;

namespace Domain.ValueObjects;

public sealed class FileType : IEquatable<FileType>
{
    public string Value { get; }
    public string Description { get; }
    public bool IsRenderable { get; }
    public FileTypeCategory Category { get; }

    private FileType(string value, string description, bool isRenderable, FileTypeCategory category)
    {
        Value = value;
        Description = description;
        IsRenderable = isRenderable;
        Category = category;
    }

    // Predefined file types
    public static readonly FileType Unknown = new("unknown", "Unknown file type", false, FileTypeCategory.Other);
    
    // Renderable 3D model files
    public static readonly FileType Obj = new("obj", "Wavefront OBJ", true, FileTypeCategory.Model3D);
    public static readonly FileType Fbx = new("fbx", "Autodesk FBX", true, FileTypeCategory.Model3D);
    public static readonly FileType Gltf = new("gltf", "glTF JSON", true, FileTypeCategory.Model3D);
    public static readonly FileType Glb = new("glb", "glTF Binary", true, FileTypeCategory.Model3D);
    
    // Project files
    public static readonly FileType Blend = new("blend", "Blender Project", false, FileTypeCategory.Project);
    public static readonly FileType Max = new("max", "3ds Max Project", false, FileTypeCategory.Project);
    public static readonly FileType Maya = new("maya", "Maya Project", false, FileTypeCategory.Project);
    
    // Textures and materials
    public static readonly FileType Texture = new("texture", "Texture Image", false, FileTypeCategory.Texture);
    public static readonly FileType Material = new("material", "Material Definition", false, FileTypeCategory.Material);
    public static readonly FileType Other = new("other", "Other file type", false, FileTypeCategory.Other);

    private static readonly Dictionary<string, FileType> ExtensionMapping = new(StringComparer.OrdinalIgnoreCase)
    {
        { ".obj", Obj },
        { ".fbx", Fbx },
        { ".gltf", Gltf },
        { ".glb", Glb },
        { ".blend", Blend },
        { ".max", Max },
        { ".ma", Maya },
        { ".mb", Maya },
        { ".jpg", Texture },
        { ".jpeg", Texture },
        { ".png", Texture },
        { ".tga", Texture },
        { ".bmp", Texture },
        { ".mtl", Material }
    };

    private static readonly FileType[] RenderableTypes = { Obj, Fbx, Gltf, Glb };

    public static Result<FileType> FromExtension(string extension)
    {
        if (string.IsNullOrWhiteSpace(extension))
            return Result.Failure<FileType>(new Error("InvalidExtension", "File extension cannot be null or empty."));

        var normalizedExtension = extension.StartsWith('.') ? extension : $".{extension}";
        
        return ExtensionMapping.TryGetValue(normalizedExtension, out var fileType) 
            ? Result.Success(fileType)
            : Result.Success(Other);
    }

    public static Result<FileType> FromFileName(string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            return Result.Failure<FileType>(new Error("InvalidFileName", "File name cannot be null or empty."));

        var extension = Path.GetExtension(fileName);
        return FromExtension(extension);
    }

    public static Result<FileType> ValidateForModelUpload(string fileName)
    {
        var fileTypeResult = FromFileName(fileName);
        if (!fileTypeResult.IsSuccess)
            return fileTypeResult;

        var fileType = fileTypeResult.Value;
        if (!fileType.IsRenderable)
        {
            return Result.Failure<FileType>(
                new Error("InvalidFileType", $"File type '{fileType.Description}' is not supported for model upload. Only .obj, .fbx, .gltf, and .glb files are allowed."));
        }

        return Result.Success(fileType);
    }

    public static Result<FileType> ValidateForUpload(string fileName)
    {
        var fileTypeResult = FromFileName(fileName);
        if (!fileTypeResult.IsSuccess)
            return fileTypeResult;

        var fileType = fileTypeResult.Value;
        if (fileType == Unknown)
        {
            var extension = Path.GetExtension(fileName);
            return Result.Failure<FileType>(
                new Error("UnsupportedFileType", $"File type '{extension}' is not supported."));
        }

        return Result.Success(fileType);
    }

    public static IReadOnlyList<FileType> GetRenderableTypes() => RenderableTypes;

    public bool Equals(FileType? other)
    {
        if (ReferenceEquals(null, other)) return false;
        if (ReferenceEquals(this, other)) return true;
        return Value == other.Value;
    }

    public override bool Equals(object? obj)
    {
        return ReferenceEquals(this, obj) || obj is FileType other && Equals(other);
    }

    public override int GetHashCode()
    {
        return Value.GetHashCode();
    }

    public static bool operator ==(FileType? left, FileType? right)
    {
        return Equals(left, right);
    }

    public static bool operator !=(FileType? left, FileType? right)
    {
        return !Equals(left, right);
    }

    public override string ToString() => Description;

    public string GetMimeType()
    {
        return Value switch
        {
            "obj" => "model/obj",
            "fbx" => "application/octet-stream",
            "gltf" => "model/gltf+json",
            "glb" => "model/gltf-binary",
            "blend" => "application/x-blender",
            "max" => "application/octet-stream",
            "maya" => "application/octet-stream",
            "texture" => "image/*", // This would need more specific logic based on actual extension
            "material" => "text/plain",
            _ => "application/octet-stream"
        };
    }
}

public enum FileTypeCategory
{
    Model3D,
    Project,
    Texture,
    Material,
    Other
}