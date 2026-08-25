namespace Application.StoreImports;

/// <summary>
/// Canonicalizes store base URLs (trims whitespace, lowercases scheme and host, strips trailing slash)
/// so that provenance deduplication and lookups are invariant to casing and trailing slash variations.
/// </summary>
public static class StoreUrlCanonicalizer
{
    public static string Canonicalize(string? url)
    {
        if (string.IsNullOrWhiteSpace(url))
            return string.Empty;

        var trimmed = url.Trim();
        if (Uri.TryCreate(trimmed, UriKind.Absolute, out var uri))
        {
            var scheme = uri.Scheme.ToLowerInvariant();
            var host = uri.Host.ToLowerInvariant();
            var portPart = uri.IsDefaultPort ? string.Empty : $":{uri.Port}";
            var path = uri.AbsolutePath.TrimEnd('/');
            return $"{scheme}://{host}{portPart}{path}";
        }

        return trimmed.TrimEnd('/');
    }
}
