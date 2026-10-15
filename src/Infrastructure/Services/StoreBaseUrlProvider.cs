using Application.Abstractions.Services;
using Application.StoreImports;
using Microsoft.Extensions.Configuration;

namespace Infrastructure.Services;

/// <summary>
/// The companion Asset Store's fixed base URL, plus the single test-only override.
///
/// <see cref="HostedStoreUrl"/> is the one address the browser (Asset Store tab), the
/// backend catalog reader and the importer all use. It is deliberately NOT environment
/// configuration: the store is built in, and there is no "unconfigured" state to opt into.
///
/// <see cref="OverrideKey"/> exists only so the e2e stack can point the backend at the
/// local store fixture it runs next to the API. It is never documented as user
/// configuration and is unset everywhere else; when it is unset the hosted address is used
/// and the override has no effect.
/// </summary>
internal sealed class StoreBaseUrlProvider : IStoreBaseUrlProvider
{
    /// <summary>The Modelibr Store. The Asset Store tab and the store tools are built around this one address.</summary>
    public const string HostedStoreUrl = "https://store.modelibr.com";

    /// <summary>Test-only seam (see the class remarks). Never user configuration; never in .env.example.</summary>
    internal const string OverrideKey = "MODELIBR_STORE_BASE_URL_OVERRIDE";

    private readonly string? _override;

    public StoreBaseUrlProvider(IConfiguration configuration)
    {
        var configured = configuration.GetValue<string?>(OverrideKey);
        _override = string.IsNullOrWhiteSpace(configured)
            ? null
            : StoreUrlCanonicalizer.Canonicalize(configured);
        StoreBaseUrl = _override ?? HostedStoreUrl;
    }

    public string StoreBaseUrl { get; }

    public string ResolveStoreBaseUrl(string requestedUrl)
        => _override ?? StoreUrlCanonicalizer.Canonicalize(requestedUrl);
}
