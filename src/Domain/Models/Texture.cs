using Domain.ValueObjects;

namespace Domain.Models;

/// <summary>
/// Represents a texture that links a File with a specific TextureType.
/// Textures are used in 3D modeling to define surface properties like color, roughness, normals, etc.
/// Supports channel mapping where individual channels (R, G, B, A) or RGB can be mapped to texture types.
/// </summary>
public class Texture
{
    public int Id { get; set; }
    public int FileId { get; private set; }
    public TextureType TextureType { get; private set; }
    
    /// <summary>
    /// The source channel from the file. Defaults to RGB for backward compatibility.
    /// Single channels (R, G, B, A) are used for grayscale textures like AO, Roughness.
    /// RGB is used for color textures like Albedo, Normal.
    /// </summary>
    public TextureChannel SourceChannel { get; private set; } = TextureChannel.RGB;
    
    public DateTime CreatedAt { get; private set; }
    public DateTime UpdatedAt { get; private set; }
    public bool IsDeleted { get; private set; }
    public DateTime? DeletedAt { get; private set; }

    // Foreign key for optional TextureSet relationship
    public int? TextureSetId { get; internal set; }

    // Navigation property for the associated file
    public File File { get; private set; } = null!;

    /// <summary>
    /// Creates a new Texture with the specified file and texture type.
    /// Source channel is automatically determined based on texture type (RGB for color, R for grayscale).
    /// </summary>
    /// <param name="file">The file containing the texture data</param>
    /// <param name="textureType">The type of texture (Albedo, Normal, etc.)</param>
    /// <param name="createdAt">When the texture was created</param>
    /// <returns>A new Texture instance</returns>
    /// <exception cref="ArgumentNullException">Thrown when file is null</exception>
    /// <exception cref="ArgumentException">Thrown when validation fails</exception>
    public static Texture Create(File file, TextureType textureType, DateTime createdAt)
    {
        // Determine default channel based on texture type
        var defaultChannel = IsColorTextureType(textureType) ? TextureChannel.RGB : TextureChannel.R;
        return Create(file, textureType, defaultChannel, createdAt);
    }

    /// <summary>
    /// Creates a new Texture with the specified file, texture type, and source channel.
    /// </summary>
    /// <param name="file">The file containing the texture data</param>
    /// <param name="textureType">The type of texture (Albedo, Normal, etc.)</param>
    /// <param name="sourceChannel">The source channel from the file (R, G, B, A, or RGB)</param>
    /// <param name="createdAt">When the texture was created</param>
    /// <returns>A new Texture instance</returns>
    /// <exception cref="ArgumentNullException">Thrown when file is null</exception>
    /// <exception cref="ArgumentException">Thrown when validation fails</exception>
    public static Texture Create(File file, TextureType textureType, TextureChannel sourceChannel, DateTime createdAt)
    {
        ValidateFile(file);
        ValidateTextureType(textureType);
        ValidateFileIsTexture(file);
        ValidateChannelTypeCompatibility(sourceChannel, textureType);

        return new Texture
        {
            FileId = file.Id,
            File = file,
            TextureType = textureType,
            SourceChannel = sourceChannel,
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
        ValidateChannelTypeCompatibility(SourceChannel, textureType);
        
        TextureType = textureType;
        UpdatedAt = updatedAt;
    }

    /// <summary>
    /// Updates the source channel for this texture.
    /// </summary>
    /// <param name="sourceChannel">The new source channel</param>
    /// <param name="updatedAt">When the update occurred</param>
    /// <exception cref="ArgumentException">Thrown when channel is incompatible with texture type</exception>
    public void UpdateSourceChannel(TextureChannel sourceChannel, DateTime updatedAt)
    {
        ValidateChannelTypeCompatibility(sourceChannel, TextureType);
        
        SourceChannel = sourceChannel;
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
        var channelInfo = SourceChannel != TextureChannel.RGB ? $" [{SourceChannel.GetShortLabel()}]" : "";
        return $"{File?.OriginalFileName ?? "Unknown"}{channelInfo} ({TextureType.GetDescription()})";
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

    /// <summary>
    /// Validates that the channel is compatible with the texture type.
    /// RGB channel is for color textures (Albedo, Normal, Emissive).
    /// Single channels (R, G, B, A) are for grayscale textures.
    /// </summary>
    private static void ValidateChannelTypeCompatibility(TextureChannel channel, TextureType textureType)
    {
        var isRgbChannel = channel.IsRgbChannel();
        var isColorType = IsColorTextureType(textureType);

        // SplitChannel type is allowed with any channel configuration
        if (textureType == TextureType.SplitChannel)
        {
            return;
        }

        if (isRgbChannel && !isColorType)
        {
            throw new ArgumentException(
                $"RGB channel can only be used with color texture types (Albedo, Normal, Emissive). " +
                $"'{textureType}' requires a single channel (R, G, B, or A).",
                nameof(channel));
        }

        if (!isRgbChannel && isColorType)
        {
            throw new ArgumentException(
                $"Color texture type '{textureType}' requires RGB channel, not a single channel.",
                nameof(channel));
        }
    }

    /// <summary>
    /// Returns true if the texture type requires RGB data (color textures).
    /// </summary>
    private static bool IsColorTextureType(TextureType textureType)
    {
        return textureType switch
        {
            TextureType.Albedo => true,
            TextureType.Normal => true,
            TextureType.Emissive => true,
            _ => false // All other types are grayscale
        };
    }

    /// <summary>
    /// Soft deletes this texture by marking it as deleted.
    /// </summary>
    /// <param name="deletedAt">When the texture was deleted</param>
    public void SoftDelete(DateTime deletedAt)
    {
        IsDeleted = true;
        DeletedAt = deletedAt;
        UpdatedAt = deletedAt;
    }

    /// <summary>
    /// Restores a soft-deleted texture.
    /// </summary>
    /// <param name="restoredAt">When the texture was restored</param>
    public void Restore(DateTime restoredAt)
    {
        IsDeleted = false;
        DeletedAt = null;
        UpdatedAt = restoredAt;
    }
}