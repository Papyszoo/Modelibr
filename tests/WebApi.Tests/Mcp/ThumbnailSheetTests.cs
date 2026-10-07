using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using WebApi.Mcp;
using Xunit;

namespace WebApi.Tests.Mcp;

/// <summary>
/// The tiling helper behind <c>withImage</c>: a fixed grid the caller can read back, and a
/// grey cell where a hit had no picture rather than a shifted layout.
/// </summary>
public class ThumbnailSheetTests
{
    [Fact]
    public void Tiles_Are_Four_Columns_And_Grow_Downward()
    {
        var thumbnails = Enumerable.Range(0, 5).Select(_ => Png(new Rgba32(255, 255, 255))).Cast<byte[]?>().ToList();

        var sheet = ThumbnailSheet.Build(thumbnails);

        using var image = Image.Load<Rgba32>(sheet);
        Assert.Equal(768, image.Width);   // 4 columns x 192
        Assert.Equal(384, image.Height);  // 2 rows x 192
    }

    [Fact]
    public void A_Hit_With_No_Thumbnail_Gets_A_Grey_Cell()
    {
        var sheet = ThumbnailSheet.Build([Png(new Rgba32(255, 255, 255)), null]);

        using var image = Image.Load<Rgba32>(sheet);
        Assert.Equal(new Rgba32(255, 255, 255), image[10, 10]);
        // The missing second hit keeps its slot: x 192-383 is the grey cell, not a shift.
        Assert.Equal(ThumbnailSheet.EmptyCell, image[192 + 10, 10]);
    }

    private static byte[] Png(Rgba32 color)
    {
        using var image = new Image<Rgba32>(8, 8, color);
        using var stream = new MemoryStream();
        image.SaveAsPng(stream);
        return stream.ToArray();
    }
}
