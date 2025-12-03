using SharedKernel;

namespace Domain.ValueObjects;

/// <summary>
/// Represents the type of sprite - either static (single image) or animated (sprite sheet, GIF, etc.).
/// </summary>
public enum SpriteType
{
    /// <summary>A static sprite consisting of a single image</summary>
    Static = 1,
    
    /// <summary>An animated sprite consisting of a sprite sheet with multiple frames</summary>
    SpriteSheet = 2,
    
    /// <summary>An animated GIF sprite</summary>
    Gif = 3,
    
    /// <summary>An animated APNG sprite</summary>
    Apng = 4,
    
    /// <summary>An animated WebP sprite</summary>
    AnimatedWebP = 5
}

/// <summary>
/// Extension methods and validation utilities for SpriteType enum.
/// </summary>
public static class SpriteTypeExtensions
{
    private static readonly SpriteType[] SupportedTypes =
    {
        SpriteType.Static,
        SpriteType.SpriteSheet,
        SpriteType.Gif,
        SpriteType.Apng,
        SpriteType.AnimatedWebP
    };

    /// <summary>
    /// Validates that the sprite type is supported for storage.
    /// </summary>
    /// <param name="spriteType">The sprite type to validate</param>
    /// <returns>Success result with the sprite type, or failure with error details</returns>
    public static Result<SpriteType> ValidateForStorage(this SpriteType spriteType)
    {
        if (!SupportedTypes.Contains(spriteType))
        {
            return Result.Failure<SpriteType>(
                new Error("UnsupportedSpriteType", $"Sprite type '{spriteType}' is not supported."));
        }

        return Result.Success(spriteType);
    }

    /// <summary>
    /// Gets all supported sprite types.
    /// </summary>
    /// <returns>Read-only list of supported sprite types</returns>
    public static IReadOnlyList<SpriteType> GetSupportedTypes() => SupportedTypes;

    /// <summary>
    /// Gets a human-readable description of the sprite type.
    /// </summary>
    /// <param name="spriteType">The sprite type</param>
    /// <returns>Descriptive string for the sprite type</returns>
    public static string GetDescription(this SpriteType spriteType)
    {
        return spriteType switch
        {
            SpriteType.Static => "Static image sprite",
            SpriteType.SpriteSheet => "Animated sprite sheet",
            SpriteType.Gif => "Animated GIF sprite",
            SpriteType.Apng => "Animated PNG sprite",
            SpriteType.AnimatedWebP => "Animated WebP sprite",
            _ => "Unknown sprite type"
        };
    }

    /// <summary>
    /// Determines if the sprite type represents an animated sprite.
    /// </summary>
    /// <param name="spriteType">The sprite type</param>
    /// <returns>True if the sprite type is animated</returns>
    public static bool IsAnimated(this SpriteType spriteType)
    {
        return spriteType != SpriteType.Static;
    }
}
