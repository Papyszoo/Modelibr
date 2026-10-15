using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace WebApi.Mcp;

/// <summary>
/// Tiles search-hit thumbnails into one image so an agent can choose between candidates
/// by looking at them rather than guessing from filenames.
/// </summary>
/// <remarks>
/// The grid is fixed on purpose: tile N is hit N, left to right and top to bottom, so a
/// reader maps a cell back to a hit without the caller having to describe a layout. A hit
/// with no ready thumbnail keeps its cell and paints it dark grey - the grid still says
/// how many hits there were, and which of them had no picture.
/// </remarks>
internal static class ThumbnailSheet
{
    /// <summary>Edge of one square cell, in pixels.</summary>
    internal const int CellSize = 192;

    /// <summary>Hits per row. Four keeps a row inside a typical vision input without downscaling.</summary>
    internal const int Columns = 4;

    /// <summary>Most tiles drawn. Past this an image stops being readable and starts being expensive.</summary>
    internal const int MaxTiles = 20;

    /// <summary>What a hit with no usable thumbnail gets instead of a tile.</summary>
    internal static readonly Rgba32 EmptyCell = new(64, 64, 64);

    /// <summary>
    /// Draws the thumbnails in hit order onto a black sheet and returns it as PNG bytes.
    /// A null entry is a hit with no ready thumbnail; its cell is drawn dark grey.
    /// </summary>
    public static byte[] Build(IReadOnlyList<byte[]?> thumbnails)
    {
        var tiles = thumbnails.Take(MaxTiles).ToList();
        var rows = Math.Max(1, (tiles.Count + Columns - 1) / Columns);

        using var sheet = new Image<Rgba32>(Columns * CellSize, rows * CellSize, new Rgba32(0, 0, 0));
        using var empty = new Image<Rgba32>(CellSize, CellSize, EmptyCell);

        for (var i = 0; i < tiles.Count; i++)
        {
            var x = i % Columns * CellSize;
            var y = i / Columns * CellSize;

            using var tile = tiles[i] is { } bytes ? FirstFrame(bytes) : null;
            sheet.Mutate(context => context.DrawImage(tile ?? empty, new Point(x, y), 1f));
        }

        using var output = new MemoryStream();
        sheet.SaveAsPng(output);
        return output.ToArray();
    }

    /// <summary>
    /// The first frame of an animated thumbnail (the library's are animated WebP), resized
    /// to one cell. Null when the bytes are not an image we can read - which is the same
    /// thing as a hit with no thumbnail, and paints the same grey cell.
    /// </summary>
    private static Image<Rgba32>? FirstFrame(byte[] bytes)
    {
        try
        {
            using var image = Image.Load<Rgba32>(bytes);
            var frame = image.Frames.CloneFrame(0);
            frame.Mutate(context => context.Resize(CellSize, CellSize));
            return frame;
        }
        catch (Exception ex) when (ex is UnknownImageFormatException or InvalidImageContentException)
        {
            return null;
        }
    }
}
