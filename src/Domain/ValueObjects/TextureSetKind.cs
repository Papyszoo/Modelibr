namespace Domain.ValueObjects;

/// <summary>
/// Distinguishes between model-specific (baked/unique) texture sets
/// and universal (tileable/global) texture sets.
/// </summary>
public enum TextureSetKind
{
    /// <summary>
    /// Baked/unique texture set tied to a specific model's UV layout.
    /// Created via baking details from high-poly to low-poly meshes.
    /// Generally non-reusable on other models without visual artifacts.
    /// </summary>
    ModelSpecific = 0,

    /// <summary>
    /// Tileable/global texture set designed for seamless repetition.
    /// Suitable for large surfaces (walls, floors, terrain) and modular kits.
    /// Exists independently of any model and supports tiling scale metadata.
    /// </summary>
    Universal = 1
}

/// <summary>
/// Extension methods for TextureSetKind enum.
/// </summary>
public static class TextureSetKindExtensions
{
    /// <summary>
    /// Gets a human-readable description of the texture set kind.
    /// </summary>
    public static string GetDescription(this TextureSetKind kind)
    {
        return kind switch
        {
            TextureSetKind.ModelSpecific => "Model-Specific (Baked/Unique)",
            TextureSetKind.Universal => "Universal (Tileable/Global)",
            _ => "Unknown"
        };
    }

    /// <summary>
    /// Gets a short label suitable for UI display.
    /// </summary>
    public static string GetLabel(this TextureSetKind kind)
    {
        return kind switch
        {
            TextureSetKind.ModelSpecific => "Model-Specific",
            TextureSetKind.Universal => "Universal",
            _ => "Unknown"
        };
    }
}
