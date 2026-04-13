using System.Globalization;

namespace Domain.ValueObjects;

public static class EnvironmentMapSizeLabel
{
    private static readonly HashSet<int> StandardDimensions =
    [
        1024,
        2048,
        4096,
        8192,
        16384,
        32768
    ];

    public static string FromDimension(int maxDimension)
    {
        if (maxDimension <= 0)
            throw new ArgumentException("Environment map dimension must be greater than 0.", nameof(maxDimension));

        return StandardDimensions.Contains(maxDimension)
            ? $"{maxDimension / 1024}K"
            : $"{maxDimension}px";
    }

    public static int GetSortScore(string? sizeLabel)
    {
        if (string.IsNullOrWhiteSpace(sizeLabel))
            return 0;

        var normalized = sizeLabel.Trim().ToLowerInvariant();

        if (normalized.EndsWith("px") && int.TryParse(normalized[..^2], out var pixelValue))
            return pixelValue;

        if (normalized.EndsWith("k") && double.TryParse(normalized[..^1], NumberStyles.Float, CultureInfo.InvariantCulture, out var kiloValue))
            return (int)Math.Round(kiloValue * 1024, MidpointRounding.AwayFromZero);

        if (normalized.EndsWith("m") && double.TryParse(normalized[..^1], NumberStyles.Float, CultureInfo.InvariantCulture, out var megaValue))
            return (int)Math.Round(megaValue * 1024 * 1024, MidpointRounding.AwayFromZero);

        return int.TryParse(normalized, out var numericValue) ? numericValue : 0;
    }
}
