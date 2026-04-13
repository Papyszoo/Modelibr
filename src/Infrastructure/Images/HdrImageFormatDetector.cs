using System.Text;

namespace Infrastructure.Images;

internal static class HdrImageFormatDetector
{
    private static readonly byte[] ExrMagic = [0x76, 0x2F, 0x31, 0x01];
    private static readonly byte[] RadianceMagic = Encoding.ASCII.GetBytes("#?RADIANCE");
    private static readonly byte[] RgbeMagic = Encoding.ASCII.GetBytes("#?RGBE");

    internal static async Task<bool> IsHdrCapableAsync(string fullPath, CancellationToken cancellationToken)
        => await IsHdrAsync(fullPath, cancellationToken) || await IsExrAsync(fullPath, cancellationToken);

    internal static async Task<bool> IsHdrAsync(string fullPath, CancellationToken cancellationToken)
    {
        var header = new byte[RadianceMagic.Length];
        await using var fs = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read, header.Length, true);
        var bytesRead = await fs.ReadAsync(header, cancellationToken);
        if (bytesRead < RgbeMagic.Length)
            return false;

        return header.AsSpan(0, Math.Min(bytesRead, RadianceMagic.Length)).StartsWith(RadianceMagic)
            || header.AsSpan(0, Math.Min(bytesRead, RgbeMagic.Length)).StartsWith(RgbeMagic);
    }

    internal static async Task<bool> IsExrAsync(string fullPath, CancellationToken cancellationToken)
    {
        var header = new byte[ExrMagic.Length];
        await using var fs = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read, header.Length, true);
        var bytesRead = await fs.ReadAsync(header, cancellationToken);
        return bytesRead == ExrMagic.Length && header.AsSpan().SequenceEqual(ExrMagic);
    }
}
