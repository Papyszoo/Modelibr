using SharedKernel;

namespace Domain.ValueObjects;

/// <summary>
/// Represents a source channel from a texture file.
/// Used for channel mapping where individual channels can be mapped to texture types.
/// </summary>
public enum TextureChannel
{
    /// <summary>Red channel (for grayscale textures like AO, Roughness, Metallic)</summary>
    R = 1,
    
    /// <summary>Green channel (for grayscale textures)</summary>
    G = 2,
    
    /// <summary>Blue channel (for grayscale textures)</summary>
    B = 3,
    
    /// <summary>Alpha channel (for transparency or height maps)</summary>
    A = 4,
    
    /// <summary>RGB group (for color textures like Albedo, Normal, Emissive)</summary>
    RGB = 5
}

/// <summary>
/// Extension methods and validation utilities for TextureChannel enum.
/// </summary>
public static class TextureChannelExtensions
{
    private static readonly TextureChannel[] SingleChannels = 
    {
        TextureChannel.R,
        TextureChannel.G,
        TextureChannel.B,
        TextureChannel.A
    };

    private static readonly TextureChannel[] AllChannels = 
    {
        TextureChannel.R,
        TextureChannel.G,
        TextureChannel.B,
        TextureChannel.A,
        TextureChannel.RGB
    };

    /// <summary>
    /// Checks if this is a single (grayscale) channel.
    /// </summary>
    public static bool IsSingleChannel(this TextureChannel channel)
    {
        return SingleChannels.Contains(channel);
    }

    /// <summary>
    /// Checks if this is the RGB group channel.
    /// </summary>
    public static bool IsRgbChannel(this TextureChannel channel)
    {
        return channel == TextureChannel.RGB;
    }

    /// <summary>
    /// Gets all supported channels.
    /// </summary>
    public static IReadOnlyList<TextureChannel> GetAllChannels() => AllChannels;

    /// <summary>
    /// Gets only single (grayscale) channels.
    /// </summary>
    public static IReadOnlyList<TextureChannel> GetSingleChannels() => SingleChannels;

    /// <summary>
    /// Gets a human-readable label for the channel.
    /// </summary>
    public static string GetLabel(this TextureChannel channel)
    {
        return channel switch
        {
            TextureChannel.R => "Red (R)",
            TextureChannel.G => "Green (G)",
            TextureChannel.B => "Blue (B)",
            TextureChannel.A => "Alpha (A)",
            TextureChannel.RGB => "RGB",
            _ => "Unknown"
        };
    }

    /// <summary>
    /// Gets the short label (single letter) for the channel.
    /// </summary>
    public static string GetShortLabel(this TextureChannel channel)
    {
        return channel switch
        {
            TextureChannel.R => "R",
            TextureChannel.G => "G",
            TextureChannel.B => "B",
            TextureChannel.A => "A",
            TextureChannel.RGB => "RGB",
            _ => "?"
        };
    }
}
