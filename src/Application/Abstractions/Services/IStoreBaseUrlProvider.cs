namespace Application.Abstractions.Services;

/// <summary>
/// Resolves the companion Asset Store's base URL.
///
/// The store is a built-in part of Modelibr with one fixed address, so this is not a
/// user-facing setting: the Asset Store tab and the store MCP tools all point at the same
/// place. The only thing that varies is a test-only override the e2e stack points at its
/// local store fixture (see the implementation).
/// </summary>
public interface IStoreBaseUrlProvider
{
    /// <summary>The store base URL outbound calls use, canonicalized without a trailing slash.</summary>
    string StoreBaseUrl { get; }

    /// <summary>
    /// The effective store base to import from for a client-supplied <paramref name="requestedUrl"/>
    /// (canonicalized), or the test override when one is set.
    /// </summary>
    string ResolveStoreBaseUrl(string requestedUrl);
}
