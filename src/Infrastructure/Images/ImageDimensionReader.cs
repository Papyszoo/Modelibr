using ImageMagick;
using SixLabors.ImageSharp;

namespace Infrastructure.Images;

/// <summary>
/// Reads pixel dimensions (and format) from an image file using a header-only probe.
/// Standard formats go through ImageSharp's <see cref="Image.IdentifyAsync(string, CancellationToken)"/>;
/// HDR/EXR files (which ImageSharp cannot decode) fall back to Magick.NET.
/// Shared by the texture and environment-map metadata flows.
/// </summary>
internal static class ImageDimensionReader
{
    internal static async Task<ImageDimensions> ReadAsync(string fullPath, CancellationToken cancellationToken)
    {
        if (await HdrImageFormatDetector.IsHdrCapableAsync(fullPath, cancellationToken))
        {
            var magickInfo = new MagickImageInfo(fullPath);
            var hdrFormat = magickInfo.Format.ToString().ToLowerInvariant();
            return new ImageDimensions((int)magickInfo.Width, (int)magickInfo.Height, hdrFormat);
        }

        var imageInfo = await Image.IdentifyAsync(fullPath, cancellationToken);
        if (imageInfo == null)
            throw new InvalidOperationException($"Could not identify image dimensions for '{fullPath}'.");

        var format = imageInfo.Metadata.DecodedImageFormat?.Name?.ToLowerInvariant();
        return new ImageDimensions(imageInfo.Width, imageInfo.Height, format);
    }
}

/// <summary>Pixel dimensions and optional format name (lower-cased) of an image.</summary>
internal readonly record struct ImageDimensions(int Width, int Height, string? Format);
