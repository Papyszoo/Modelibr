using SharedKernel;

namespace Domain.ValueObjects;

/// <summary>
/// Represents the supported texture types for 3D models.
/// This enum defines all valid texture types that can be associated with texture files.
/// </summary>
public enum TextureType
{
    /// <summary>Base color map - the main surface color</summary>
    Albedo = 1,
    
    /// <summary>Normal map - surface detail through normals</summary>
    Normal = 2,
    
    /// <summary>Height map - surface geometry variation (mutually exclusive with Bump, Displacement)</summary>
    Height = 3,
    
    /// <summary>Ambient Occlusion map - shadow detail in surface crevices</summary>
    AO = 4,
    
    /// <summary>Roughness map - surface micro-detail affecting reflections</summary>
    Roughness = 5,
    
    /// <summary>Metallic map - defines metallic vs non-metallic areas</summary>
    Metallic = 6,
    
    // Diffuse = 7 (REMOVED - use Albedo instead)
    // Specular = 8 (REMOVED - not PBR standard)
    
    /// <summary>Emissive map - areas where the mesh emits light</summary>
    Emissive = 9,
    
    /// <summary>Bump map - simulates surface details by altering normals (mutually exclusive with Height, Displacement)</summary>
    Bump = 10,
    
    /// <summary>Alpha map - defines transparency across the surface</summary>
    Alpha = 11,
    
    /// <summary>Displacement map - actual geometric displacement of vertices (mutually exclusive with Height, Bump)</summary>
    Displacement = 12
}

/// <summary>
/// Extension methods and validation utilities for TextureType enum.
/// </summary>
public static class TextureTypeExtensions
{
    private static readonly TextureType[] SupportedTypes = 
    {
        TextureType.Albedo,
        TextureType.Normal, 
        TextureType.Height,
        TextureType.AO,
        TextureType.Roughness,
        TextureType.Metallic,
        TextureType.Emissive,
        TextureType.Bump,
        TextureType.Alpha,
        TextureType.Displacement
    };

    /// <summary>
    /// Height, Displacement, and Bump are mutually exclusive - only one can be present in a texture set.
    /// </summary>
    public static readonly TextureType[] MutuallyExclusiveHeightTypes = 
    {
        TextureType.Height,
        TextureType.Displacement,
        TextureType.Bump
    };

    /// <summary>
    /// Validates that the texture type is supported for texture storage.
    /// </summary>
    /// <param name="textureType">The texture type to validate</param>
    /// <returns>Success result with the texture type, or failure with error details</returns>
    public static Result<TextureType> ValidateForStorage(this TextureType textureType)
    {
        if (!SupportedTypes.Contains(textureType))
        {
            return Result.Failure<TextureType>(
                new Error("UnsupportedTextureType", $"Texture type '{textureType}' is not supported."));
        }

        return Result.Success(textureType);
    }

    /// <summary>
    /// Checks if this texture type is mutually exclusive with Height/Displacement/Bump.
    /// </summary>
    public static bool IsHeightRelatedType(this TextureType textureType)
    {
        return MutuallyExclusiveHeightTypes.Contains(textureType);
    }

    /// <summary>
    /// Gets all supported texture types.
    /// </summary>
    /// <returns>Read-only list of supported texture types</returns>
    public static IReadOnlyList<TextureType> GetSupportedTypes() => SupportedTypes;

    /// <summary>
    /// Gets a human-readable description of the texture type.
    /// </summary>
    /// <param name="textureType">The texture type</param>
    /// <returns>Descriptive string for the texture type</returns>
    public static string GetDescription(this TextureType textureType)
    {
        return textureType switch
        {
            TextureType.Albedo => "Base color map",
            TextureType.Normal => "Normal map for surface detail",
            TextureType.Height => "Height map for parallax/displacement",
            TextureType.AO => "Ambient Occlusion map",
            TextureType.Roughness => "Surface roughness map",
            TextureType.Metallic => "Metallic surface map",
            TextureType.Emissive => "Emissive map for glowing areas",
            TextureType.Bump => "Bump map for surface detail",
            TextureType.Alpha => "Alpha map for transparency",
            TextureType.Displacement => "Displacement map for vertex displacement",
            _ => "Unknown texture type"
        };
    }
}