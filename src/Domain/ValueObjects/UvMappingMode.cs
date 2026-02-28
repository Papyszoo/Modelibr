namespace Domain.ValueObjects;

/// <summary>
/// Defines the UV mapping mode for texture sets.
/// Only relevant for Universal (Global Material) texture sets.
/// </summary>
public enum UvMappingMode
{
    /// <summary>
    /// Standard UV mapping — TilingScaleX/Y are applied as direct texture.repeat values.
    /// Uses the geometry's built-in UV coordinates [0,1].
    /// Suitable for hand-painted or baked textures.
    /// </summary>
    Standard = 0,

    /// <summary>
    /// Physical UV scaling — texture.repeat is computed from geometry dimensions
    /// divided by UvScale to maintain consistent texel density across all shapes.
    /// The UvScale value represents the world-space size of one texture tile.
    /// Suitable for tileable PBR materials (brick, wood, concrete, etc.).
    /// </summary>
    Physical = 1
}
