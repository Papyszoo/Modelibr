using SharedKernel;

namespace Domain.ValueObjects;

/// <summary>
/// Represents the supported texture types for 3D models.
/// This enum defines all valid texture types that can be associated with texture files.
/// </summary>
public enum TextureType
{
    /// <summary>Base color or diffuse map - the main surface color</summary>
    Albedo = 1,
    
    /// <summary>Normal map - surface detail through normals</summary>
    Normal = 2,
    
    /// <summary>Height or displacement map - surface geometry variation</summary>
    Height = 3,
    
    /// <summary>Ambient Occlusion map - shadow detail in surface crevices</summary>
    AO = 4,
    
    /// <summary>Roughness map - surface micro-detail affecting reflections</summary>
    Roughness = 5,
    
    /// <summary>Metallic map - defines metallic vs non-metallic areas</summary>
    Metallic = 6,
    
    /// <summary>Diffuse map - traditional diffuse color (legacy name for Albedo)</summary>
    Diffuse = 7,
    
    /// <summary>Specular map - reflectivity and highlight intensity</summary>
    Specular = 8,
    
    /// <summary>Emissive map - areas where the mesh emits light</summary>
    Emissive = 9,
    
    /// <summary>Bump map - simulates surface details by altering normals</summary>
    Bump = 10,
    
    /// <summary>Alpha map - defines transparency across the surface</summary>
    Alpha = 11,
    
    /// <summary>Displacement map - actual geometric displacement of vertices</summary>
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
        TextureType.Diffuse,
        TextureType.Specular,
        TextureType.Emissive,
        TextureType.Bump,
        TextureType.Alpha,
        TextureType.Displacement
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
            TextureType.Albedo => "Base color or diffuse map",
            TextureType.Normal => "Normal map for surface detail",
            TextureType.Height => "Height or displacement map",
            TextureType.AO => "Ambient Occlusion map",
            TextureType.Roughness => "Surface roughness map",
            TextureType.Metallic => "Metallic surface map",
            TextureType.Diffuse => "Diffuse color map (legacy)",
            TextureType.Specular => "Specular reflectivity map",
            TextureType.Emissive => "Emissive map for glowing areas",
            TextureType.Bump => "Bump map for surface detail",
            TextureType.Alpha => "Alpha map for transparency",
            TextureType.Displacement => "Displacement map for vertex displacement",
            _ => "Unknown texture type"
        };
    }
}