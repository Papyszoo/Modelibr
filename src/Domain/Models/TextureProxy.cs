namespace Domain.Models;

/// <summary>
/// Represents a resized proxy version of a Texture, generated for efficient WebGL rendering.
/// Links the original Texture to a downscaled File at a specific square resolution.
/// The proxy is strictly for 3D rendering — not for UI thumbnails or previews.
/// </summary>
public class TextureProxy
{
    public int Id { get; private set; }
    public int TextureId { get; private set; }
    public int FileId { get; private set; }

    /// <summary>
    /// Square side length in pixels (e.g. 256, 512, 1024, 2048).
    /// </summary>
    public int Size { get; private set; }

    public DateTime CreatedAt { get; private set; }

    // Navigation properties
    public Texture Texture { get; private set; } = null!;
    public File File { get; private set; } = null!;

    private TextureProxy() { }

    /// <summary>
    /// Creates a new TextureProxy linking a texture to its downscaled file.
    /// </summary>
    /// <param name="textureId">The source texture ID</param>
    /// <param name="file">The generated downscaled file</param>
    /// <param name="size">Square side length in pixels (256, 512, 1024, 2048)</param>
    /// <param name="createdAt">When the proxy was generated</param>
    public static TextureProxy Create(int textureId, File file, int size, DateTime createdAt)
    {
        ValidateFile(file);
        ValidateSize(size);

        return new TextureProxy
        {
            TextureId = textureId,
            FileId = file.Id,
            File = file,
            Size = size,
            CreatedAt = createdAt
        };
    }

    private static void ValidateFile(File? file)
    {
        if (file is null)
            throw new ArgumentNullException(nameof(file), "File cannot be null.");
    }

    private static void ValidateSize(int size)
    {
        if (size is not (256 or 512 or 1024 or 2048))
            throw new ArgumentException(
                "Size must be one of: 256, 512, 1024, 2048.",
                nameof(size));
    }
}
