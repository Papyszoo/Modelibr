namespace Application.StoreImports;

/// <summary>
/// Canonicalizes store base URLs (trims whitespace, lowercases scheme and host, formats IPv6 brackets,
/// normalizes default ports, preserves path casing, and strips trailing slashes)
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
            var host = uri.HostNameType == UriHostNameType.IPv6
                ? $"[{uri.Host.Trim('[', ']').ToLowerInvariant()}]"
                : uri.Host.ToLowerInvariant();

            var isDefaultPort = uri.IsDefaultPort ||
                (scheme == "http" && uri.Port == 80) ||
                (scheme == "https" && uri.Port == 443);

            var portPart = isDefaultPort ? string.Empty : $":{uri.Port}";
            var path = uri.AbsolutePath.TrimEnd('/');
            return $"{scheme}://{host}{portPart}{path}";
        }

        return trimmed.TrimEnd('/');
    }
}
