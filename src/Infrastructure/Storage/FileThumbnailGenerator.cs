using Application.Abstractions.Storage;
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

    /// <summary>EXR magic bytes: 0x76 0x2F 0x31 0x01</summary>
    private static readonly byte[] ExrMagic = [0x76, 0x2F, 0x31, 0x01];

    // MIME types that can be loaded by ImageSharp for thumbnail generation.
    // Includes "image/*" which is the generic texture MIME type from the domain.
    private static readonly HashSet<string> SupportedMimeTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/png", "image/jpeg", "image/bmp", "image/gif", "image/webp", "image/*"
    };

    // Texture MIME types that get 4-channel thumbnails (RGB + R + G + B).
    // "image/*" is the generic texture MIME type used for .png/.jpg/.bmp textures.
    private static readonly HashSet<string> TextureMimeTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/png", "image/jpeg", "image/bmp", "image/*"
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

        // Check if RGB preview already exists (deduplication — same hash = same content)
        if (_previewService.GetPreviewPath(sha256Hash) != null)
        {
            _logger.LogDebug("Preview already exists for hash {Hash}", sha256Hash);
            return;
        }

        try
        {
            using var image = await LoadImageAsync(fullPath, ct);

            // Generate RGB thumbnail
            await GenerateRgbThumbnailAsync(image, sha256Hash, ct);

            // For texture files, also generate R, G, B channel thumbnails
            if (TextureMimeTypes.Contains(mimeType))
            {
                await GenerateChannelThumbnailAsync(image, sha256Hash, "r", ct);
                await GenerateChannelThumbnailAsync(image, sha256Hash, "g", ct);
                await GenerateChannelThumbnailAsync(image, sha256Hash, "b", ct);
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
        if (await IsExrFileAsync(fullPath, ct))
        {
            _logger.LogDebug("Detected EXR file, loading via Magick.NET: {Path}", fullPath);
            return LoadExrImage(fullPath);
        }

        return await Image.LoadAsync<Rgba32>(fullPath, ct);
    }

    /// <summary>
    /// Check if a file is EXR by reading its 4-byte magic number.
    /// EXR magic: 0x76 0x2F 0x31 0x01
    /// </summary>
    private static async Task<bool> IsExrFileAsync(string fullPath, CancellationToken ct)
    {
        var header = new byte[4];
        await using var fs = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read, 4, true);
        var bytesRead = await fs.ReadAsync(header, ct);
        return bytesRead == 4 && header.AsSpan().SequenceEqual(ExrMagic);
    }

    /// <summary>
    /// Load an EXR file via Magick.NET (ImageMagick) and convert to ImageSharp Image&lt;Rgba32&gt;.
    /// Applies Reinhard tone mapping for HDR → LDR conversion, matching the worker's tone mapping.
    /// </summary>
    private static Image<Rgba32> LoadExrImage(string fullPath)
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
        // Calculate thumbnail dimensions maintaining aspect ratio
        var ratioX = (double)ThumbnailSize / source.Width;
        var ratioY = (double)ThumbnailSize / source.Height;
        var ratio = Math.Min(ratioX, ratioY);
        var newWidth = Math.Max(1, (int)(source.Width * ratio));
        var newHeight = Math.Max(1, (int)(source.Height * ratio));

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
