using Application.Abstractions.Storage;
using Infrastructure.Images;
using ImageMagick;
using Microsoft.Extensions.Logging;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace Infrastructure.Storage;

/// <summary>
/// Generates thumbnail previews for uploaded files using ImageSharp.
/// For texture files: generates 4 thumbnails (RGB, R, G, B channels).
/// For sprite/image files: generates 1 RGB thumbnail.
/// EXR files are loaded via Magick.NET (ImageMagick) since ImageSharp doesn't support them.
/// </summary>
public sealed class FileThumbnailGenerator : IFileThumbnailGenerator
{
    private readonly IFilePreviewService _previewService;
    private readonly ILogger<FileThumbnailGenerator> _logger;
    private const int ThumbnailSize = 256;

    // MIME types that can be loaded by ImageSharp for thumbnail generation.
    // Includes "image/*" which is the generic texture MIME type from the domain.
    private static readonly HashSet<string> SupportedMimeTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/png", "image/jpeg", "image/bmp", "image/gif", "image/webp", "image/*", "image/vnd.radiance", "image/x-exr"
    };

    // Texture MIME types that get 4-channel thumbnails (RGB + R + G + B).
    // "image/*" is the generic texture MIME type used for .png/.jpg/.bmp textures.
    private static readonly HashSet<string> TextureMimeTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/png", "image/jpeg", "image/bmp", "image/*", "image/vnd.radiance", "image/x-exr"
    };

    public FileThumbnailGenerator(
        IFilePreviewService previewService,
        ILogger<FileThumbnailGenerator> logger)
    {
        _previewService = previewService;
        _logger = logger;
    }

    public async Task GeneratePreviewsAsync(string sha256Hash, string fullPath, string mimeType, CancellationToken ct)
    {
        if (!SupportedMimeTypes.Contains(mimeType))
        {
            _logger.LogDebug("Skipping preview generation for unsupported MIME type: {MimeType}", mimeType);
            return;
        }

        // Check which previews are missing and only generate those (deduplication — same hash = same content)
        var rgbExists = _previewService.GetPreviewPath(sha256Hash) != null;
        var needsChannels = TextureMimeTypes.Contains(mimeType);
        var rExists = needsChannels && _previewService.GetPreviewPath(sha256Hash, "r") != null;
        var gExists = needsChannels && _previewService.GetPreviewPath(sha256Hash, "g") != null;
        var bExists = needsChannels && _previewService.GetPreviewPath(sha256Hash, "b") != null;

        if (rgbExists && (!needsChannels || (rExists && gExists && bExists)))
        {
            _logger.LogDebug("All previews already exist for hash {Hash}", sha256Hash);
            return;
        }

        try
        {
            using var image = await LoadImageAsync(fullPath, ct);

            // Generate RGB thumbnail if missing
            if (!rgbExists)
                await GenerateRgbThumbnailAsync(image, sha256Hash, ct);

            // For texture files, generate missing R, G, B channel thumbnails
            if (needsChannels)
            {
                if (!rExists) await GenerateChannelThumbnailAsync(image, sha256Hash, "r", ct);
                if (!gExists) await GenerateChannelThumbnailAsync(image, sha256Hash, "g", ct);
                if (!bExists) await GenerateChannelThumbnailAsync(image, sha256Hash, "b", ct);
            }

            _logger.LogInformation(
                "Generated preview thumbnails for file {Hash} ({Width}x{Height} -> {ThumbnailSize}px)",
                sha256Hash, image.Width, image.Height, ThumbnailSize);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to generate preview for {Hash}: {Error}", sha256Hash, ex.Message);
        }
    }

    /// <summary>
    /// Load an image file, automatically detecting EXR format via magic bytes.
    /// EXR files are loaded through Magick.NET; all other formats through ImageSharp.
    /// </summary>
    private async Task<Image<Rgba32>> LoadImageAsync(string fullPath, CancellationToken ct)
    {
        if (await HdrImageFormatDetector.IsHdrCapableAsync(fullPath, ct))
        {
            _logger.LogDebug("Detected HDR-capable file, loading via Magick.NET: {Path}", fullPath);
            return LoadHdrCapableImage(fullPath);
        }

        return await Image.LoadAsync<Rgba32>(fullPath, ct);
    }

    /// <summary>
    /// Load an EXR file via Magick.NET (ImageMagick) and convert to ImageSharp Image&lt;Rgba32&gt;.
    /// Applies Reinhard tone mapping for HDR → LDR conversion, matching the worker's tone mapping.
    /// </summary>
    private static Image<Rgba32> LoadHdrCapableImage(string fullPath)
    {
        using var magickImage = new MagickImage(fullPath);

        var width = (int)magickImage.Width;
        var height = (int)magickImage.Height;

        // Get floating-point pixel data for proper HDR tone mapping.
        // IPixelCollection provides access to normalized [0..1+] float values for HDR data.
        using var pixels = magickImage.GetPixels();
        var channelCount = magickImage.ChannelCount;

        var image = new Image<Rgba32>(width, height);

        image.ProcessPixelRows(accessor =>
        {
            for (int y = 0; y < height; y++)
            {
                var row = accessor.GetRowSpan(y);
                for (int x = 0; x < width; x++)
                {
                    var pixel = pixels.GetPixel(x, y);
                    // Get values normalized to [0..1+] range (can exceed 1.0 for HDR)
                    var values = pixel.ToArray();

                    float r, g, b;
                    if (channelCount >= 3)
                    {
                        // Normalize from QuantumRange to [0..1+]
                        r = (float)values[0] / (float)Quantum.Max;
                        g = (float)values[1] / (float)Quantum.Max;
                        b = (float)values[2] / (float)Quantum.Max;
                    }
                    else
                    {
                        // Grayscale EXR
                        var val = (float)values[0] / (float)Quantum.Max;
                        r = g = b = val;
                    }

                    // Apply Reinhard tone mapping (matches worker's toneMapReinhard function)
                    row[x] = new Rgba32(
                        ToneMapReinhard(r),
                        ToneMapReinhard(g),
                        ToneMapReinhard(b),
                        255);
                }
            }
        });

        return image;
    }

    /// <summary>
    /// Reinhard tone mapping: HDR → LDR.
    /// Matches the worker's toneMapReinhard implementation in imagePreviewGenerator.js.
    /// </summary>
    private static byte ToneMapReinhard(float value)
    {
        if (value <= 0f) return 0;
        var mapped = value / (1f + value);
        var srgb = MathF.Pow(mapped, 1f / 2.2f);
        return (byte)Math.Min(255, (int)MathF.Round(srgb * 255f));
    }

    private async Task GenerateRgbThumbnailAsync(Image<Rgba32> source, string sha256Hash, CancellationToken ct)
    {
        using var thumbnail = source.Clone(ctx =>
            ctx.Resize(new ResizeOptions
            {
                Size = new Size(ThumbnailSize, ThumbnailSize),
                Mode = ResizeMode.Max
            }));

        using var ms = new MemoryStream();
        await thumbnail.SaveAsPngAsync(ms, ct);
        ms.Position = 0;
        await _previewService.SavePreviewAsync(sha256Hash, ms, ct);
    }

    private async Task GenerateChannelThumbnailAsync(Image<Rgba32> source, string sha256Hash, string channel, CancellationToken ct)
    {
        using var resized = source.Clone(ctx =>
            ctx.Resize(new ResizeOptions
            {
                Size = new Size(ThumbnailSize, ThumbnailSize),
                Mode = ResizeMode.Max
            }));

        // Extract single channel as grayscale
        using var grayscale = new Image<L8>(resized.Width, resized.Height);

        resized.ProcessPixelRows(grayscale, (sourceAccessor, targetAccessor) =>
        {
            for (int y = 0; y < sourceAccessor.Height; y++)
            {
                var sourceRow = sourceAccessor.GetRowSpan(y);
                var targetRow = targetAccessor.GetRowSpan(y);

                for (int x = 0; x < sourceRow.Length; x++)
                {
                    byte val = channel switch
                    {
                        "r" => sourceRow[x].R,
                        "g" => sourceRow[x].G,
                        "b" => sourceRow[x].B,
                        _ => sourceRow[x].R
                    };
                    targetRow[x] = new L8(val);
                }
            }
        });

        using var ms = new MemoryStream();
        await grayscale.SaveAsPngAsync(ms, ct);
        ms.Position = 0;
        await _previewService.SavePreviewAsync(sha256Hash, channel, ms, ct);
    }
}
