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
    public static readonly FileType Hdr = new("hdr", "Radiance HDR Image", false, FileTypeCategory.Texture);
    public static readonly FileType Material = new("material", "Material Definition", false, FileTypeCategory.Material);
    public static readonly FileType Other = new("other", "Other file type", false, FileTypeCategory.Other);
    
    // Sprite types
    public static readonly FileType Sprite = new("sprite", "Sprite Image", false, FileTypeCategory.Sprite);
    public static readonly FileType SpriteSheet = new("spritesheet", "Sprite Sheet", false, FileTypeCategory.Sprite);
    public static readonly FileType Gif = new("gif", "Animated GIF", false, FileTypeCategory.Sprite);
    public static readonly FileType Apng = new("apng", "Animated PNG", false, FileTypeCategory.Sprite);
    public static readonly FileType WebP = new("webp", "WebP Image", false, FileTypeCategory.Sprite);
    
    // Audio types
    public static readonly FileType Mp3 = new("mp3", "MP3 Audio", false, FileTypeCategory.Audio);
    public static readonly FileType Wav = new("wav", "WAV Audio", false, FileTypeCategory.Audio);
    public static readonly FileType Ogg = new("ogg", "OGG Audio", false, FileTypeCategory.Audio);
    public static readonly FileType Flac = new("flac", "FLAC Audio", false, FileTypeCategory.Audio);
    public static readonly FileType Aac = new("aac", "AAC Audio", false, FileTypeCategory.Audio);
    public static readonly FileType M4a = new("m4a", "M4A Audio", false, FileTypeCategory.Audio);

    // Script / source-code types. `Value` is the highlight language id consumed
    // by the frontend editor; multiple extensions may share one language.
    public static readonly FileType JavaScript = new("javascript", "JavaScript Source", false, FileTypeCategory.Script);
    public static readonly FileType TypeScript = new("typescript", "TypeScript Source", false, FileTypeCategory.Script);
    public static readonly FileType Python = new("python", "Python Source", false, FileTypeCategory.Script);
    public static readonly FileType CSharp = new("csharp", "C# Source", false, FileTypeCategory.Script);
    public static readonly FileType Cpp = new("cpp", "C/C++ Source", false, FileTypeCategory.Script);
    public static readonly FileType Lua = new("lua", "Lua Source", false, FileTypeCategory.Script);
    public static readonly FileType Java = new("java", "Java Source", false, FileTypeCategory.Script);
    public static readonly FileType Go = new("go", "Go Source", false, FileTypeCategory.Script);
    public static readonly FileType Rust = new("rust", "Rust Source", false, FileTypeCategory.Script);
    public static readonly FileType Ruby = new("ruby", "Ruby Source", false, FileTypeCategory.Script);
    public static readonly FileType Php = new("php", "PHP Source", false, FileTypeCategory.Script);
    public static readonly FileType Shell = new("shell", "Shell Script", false, FileTypeCategory.Script);
    public static readonly FileType Sql = new("sql", "SQL Script", false, FileTypeCategory.Script);
    public static readonly FileType Json = new("json", "JSON", false, FileTypeCategory.Script);
    public static readonly FileType Yaml = new("yaml", "YAML", false, FileTypeCategory.Script);
    public static readonly FileType Xml = new("xml", "XML", false, FileTypeCategory.Script);
    public static readonly FileType Glsl = new("glsl", "GLSL Shader", false, FileTypeCategory.Script);
    public static readonly FileType Hlsl = new("hlsl", "HLSL Shader", false, FileTypeCategory.Script);
    public static readonly FileType GdScript = new("gdscript", "GDScript Source", false, FileTypeCategory.Script);

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
        { ".tif", Texture },
        { ".tiff", Texture },
        { ".exr", Texture },
        { ".hdr", Hdr },
        { ".mtl", Material },
        { ".gif", Gif },
        { ".webp", WebP },
        { ".mp3", Mp3 },
        { ".wav", Wav },
        { ".ogg", Ogg },
        { ".flac", Flac },
        { ".aac", Aac },
        { ".m4a", M4a },
        // Scripts / source code
        { ".js", JavaScript },
        { ".jsx", JavaScript },
        { ".mjs", JavaScript },
        { ".cjs", JavaScript },
        { ".ts", TypeScript },
        { ".tsx", TypeScript },
        { ".py", Python },
        { ".cs", CSharp },
        { ".cpp", Cpp },
        { ".cc", Cpp },
        { ".cxx", Cpp },
        { ".c", Cpp },
        { ".h", Cpp },
        { ".hpp", Cpp },
        { ".lua", Lua },
        { ".java", Java },
        { ".go", Go },
        { ".rs", Rust },
        { ".rb", Ruby },
        { ".php", Php },
        { ".sh", Shell },
        { ".sql", Sql },
        { ".json", Json },
        { ".yaml", Yaml },
        { ".yml", Yaml },
        { ".xml", Xml },
        { ".glsl", Glsl },
        { ".vert", Glsl },
        { ".frag", Glsl },
        { ".hlsl", Hlsl },
        { ".shader", Hlsl },
        { ".gd", GdScript }
    };

    private static readonly FileType[] RenderableTypes = { Obj, Fbx, Gltf, Glb };
    private static readonly FileType[] SpriteTypes = { Sprite, SpriteSheet, Gif, Apng, WebP, Texture };
    private static readonly FileType[] AudioTypes = { Mp3, Wav, Ogg, Flac, Aac, M4a };
    private static readonly FileType[] ScriptTypes =
    {
        JavaScript, TypeScript, Python, CSharp, Cpp, Lua, Java, Go, Rust, Ruby,
        Php, Shell, Sql, Json, Yaml, Xml, Glsl, Hlsl, GdScript
    };

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
        if (fileTypeResult.IsFailure)
            return fileTypeResult;

        var fileType = fileTypeResult.Value;
        if (!fileType.IsRenderable && fileType.Category != FileTypeCategory.Project)
        {
            return Result.Failure<FileType>(
                new Error("InvalidFileType", $"File type '{fileType.Description}' is not supported for model upload. Only .obj, .fbx, .gltf, .glb, and .blend files are allowed."));
        }

        return Result.Success(fileType);
    }

    public static Result<FileType> ValidateForUpload(string fileName)
    {
        var fileTypeResult = FromFileName(fileName);
        if (fileTypeResult.IsFailure)
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

    public static IReadOnlyList<FileType> GetSpriteTypes() => SpriteTypes;

    public static IReadOnlyList<FileType> GetAudioTypes() => AudioTypes;

    public static IReadOnlyList<FileType> GetScriptTypes() => ScriptTypes;

    // Canonical extension for each script language id — used when authoring a
    // script in-app (no uploaded file), to synthesize a file name.
    private static readonly Dictionary<string, string> ScriptLanguageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        { "javascript", ".js" },
        { "typescript", ".ts" },
        { "python", ".py" },
        { "csharp", ".cs" },
        { "cpp", ".cpp" },
        { "lua", ".lua" },
        { "java", ".java" },
        { "go", ".go" },
        { "rust", ".rs" },
        { "ruby", ".rb" },
        { "php", ".php" },
        { "shell", ".sh" },
        { "sql", ".sql" },
        { "json", ".json" },
        { "yaml", ".yaml" },
        { "xml", ".xml" },
        { "glsl", ".glsl" },
        { "hlsl", ".hlsl" },
        { "gdscript", ".gd" }
    };

    /// <summary>Returns the canonical file extension (with dot) for a script language id, or null if unknown.</summary>
    public static string? GetExtensionForScriptLanguage(string language)
        => string.IsNullOrWhiteSpace(language)
            ? null
            : ScriptLanguageExtensions.TryGetValue(language.Trim(), out var ext) ? ext : null;

    public static Result<FileType> ValidateForScriptUpload(string fileName)
    {
        var fileTypeResult = FromFileName(fileName);
        if (fileTypeResult.IsFailure)
            return fileTypeResult;

        var fileType = fileTypeResult.Value;
        if (fileType.Category != FileTypeCategory.Script)
        {
            return Result.Failure<FileType>(
                new Error("InvalidFileType", $"File type '{fileType.Description}' is not supported for script upload. Only source-code files (.js, .ts, .lua, .py, .cs, .cpp, .glsl, etc.) are allowed."));
        }

        return Result.Success(fileType);
    }

    public static Result<FileType> ValidateForEnvironmentMapUpload(string fileName)
    {
        var fileTypeResult = FromFileName(fileName);
        if (fileTypeResult.IsFailure)
            return fileTypeResult;

        var fileType = fileTypeResult.Value;
        if (fileType.Category != FileTypeCategory.Texture)
        {
            return Result.Failure<FileType>(
                new Error("InvalidFileType", $"File type '{fileType.Description}' is not supported for environment map upload. Only image and HDR texture files are allowed."));
        }

        return Result.Success(fileType);
    }
    
    public static Result<FileType> ValidateForSpriteUpload(string fileName)
    {
        var fileTypeResult = FromFileName(fileName);
        if (fileTypeResult.IsFailure)
            return fileTypeResult;

        var fileType = fileTypeResult.Value;
        if (fileType.Category != FileTypeCategory.Sprite && fileType.Category != FileTypeCategory.Texture)
        {
            return Result.Failure<FileType>(
                new Error("InvalidFileType", $"File type '{fileType.Description}' is not supported for sprite upload. Only image files (.png, .jpg, .gif, .webp, etc.) are allowed."));
        }

        return Result.Success(fileType);
    }
    
    public static Result<FileType> ValidateForSoundUpload(string fileName)
    {
        var fileTypeResult = FromFileName(fileName);
        if (fileTypeResult.IsFailure)
            return fileTypeResult;

        var fileType = fileTypeResult.Value;
        if (fileType.Category != FileTypeCategory.Audio)
        {
            return Result.Failure<FileType>(
                new Error("InvalidFileType", $"File type '{fileType.Description}' is not supported for sound upload. Only audio files (.mp3, .wav, .ogg, .flac, .aac, .m4a) are allowed."));
        }

        return Result.Success(fileType);
    }

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
        // Source-code files are served and edited as plain UTF-8 text.
        if (Category == FileTypeCategory.Script)
            return "text/plain";

        return Value switch
        {
            "obj" => "model/obj",
            "fbx" => "application/octet-stream",
            "gltf" => "model/gltf+json",
            "glb" => "model/gltf-binary",
            "blend" => "application/x-blender",
            "max" => "application/octet-stream",
            "maya" => "application/octet-stream",
            "texture" => "image/*",
            "hdr" => "image/vnd.radiance",
            "material" => "text/plain",
            "sprite" => "image/*",
            "spritesheet" => "image/*",
            "gif" => "image/gif",
            "apng" => "image/apng",
            "webp" => "image/webp",
            "mp3" => "audio/mpeg",
            "wav" => "audio/wav",
            "ogg" => "audio/ogg",
            "flac" => "audio/flac",
            "aac" => "audio/aac",
            "m4a" => "audio/mp4",
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
    Sprite,
    Audio,
    Script,
    Other
}
