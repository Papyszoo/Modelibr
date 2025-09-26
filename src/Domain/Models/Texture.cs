using Domain.ValueObjects;

namespace Domain.Models;

/// <summary>
/// Represents a texture that links a File with a specific TextureType.
/// Textures are used in 3D modeling to define surface properties like color, roughness, normals, etc.
/// </summary>
public class Texture
{
    public int Id { get; set; }
    public int FileId { get; private set; }
    public TextureType TextureType { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }

    // Foreign key for optional TexturePack relationship
    public int? TexturePackId { get; internal set; }

    // Navigation property for the associated file
    public File File { get; private set; } = null!;

    /// <summary>
    /// Creates a new Texture with the specified file and texture type.
    /// </summary>
    /// <param name="file">The file containing the texture data</param>
    /// <param name="textureType">The type of texture (Albedo, Normal, etc.)</param>
    /// <param name="createdAt">When the texture was created</param>
    /// <returns>A new Texture instance</returns>
    /// <exception cref="ArgumentNullException">Thrown when file is null</exception>
    /// <exception cref="ArgumentException">Thrown when validation fails</exception>
    public static Texture Create(File file, TextureType textureType, DateTime createdAt)
    {
        ValidateFile(file);
        ValidateTextureType(textureType);
        ValidateFileIsTexture(file);

        return new Texture
        {
            FileId = file.Id,
            File = file,
            TextureType = textureType,
            CreatedAt = createdAt,
            UpdatedAt = createdAt
        };
    }

    /// <summary>
    /// Updates the texture type, ensuring it remains valid.
    /// </summary>
    /// <param name="textureType">The new texture type</param>
    /// <param name="updatedAt">When the update occurred</param>
    /// <exception cref="ArgumentException">Thrown when texture type is invalid</exception>
    public void UpdateTextureType(TextureType textureType, DateTime updatedAt)
    {
        ValidateTextureType(textureType);
        
        TextureType = textureType;
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Checks if this texture is of the specified type.
    /// </summary>
    /// <param name="textureType">The texture type to check</param>
    /// <returns>True if the texture matches the specified type</returns>
    public bool IsOfType(TextureType textureType)
    {
        return TextureType == textureType;
    }

    /// <summary>
    /// Gets a human-readable description of this texture.
    /// </summary>
    /// <returns>Description combining file name and texture type</returns>
    public string GetDescription()
    {
        return $"{File?.OriginalFileName ?? "Unknown"} ({TextureType.GetDescription()})";
    }

    private static void ValidateFile(File? file)
    {
        if (file is null)
            throw new ArgumentNullException(nameof(file), "File cannot be null.");
    }

    private static void ValidateTextureType(TextureType textureType)
    {
        var validationResult = textureType.ValidateForStorage();
        if (!validationResult.IsSuccess)
        {
            throw new ArgumentException(validationResult.Error.Message, nameof(textureType));
        }
    }

    private static void ValidateFileIsTexture(File file)
    {
        if (file.FileType.Category != FileTypeCategory.Texture)
        {
            throw new ArgumentException(
                $"File type '{file.FileType.Description}' is not a texture. Only files with Texture category can be used for textures.",
                nameof(file));
        }
    }
}