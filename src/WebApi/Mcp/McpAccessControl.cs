using System.Security.Cryptography;
using System.Text;

namespace WebApi.Mcp;

/// <summary>What a token is allowed to do. Each level is a strict superset of the work below it.</summary>
public enum McpScope
{
    /// <summary>Search and read assets. Every valid token has at least this.</summary>
    Read,

    /// <summary>Import, tag, categorize, pack, bind - anything that creates or changes an asset.</summary>
    Write,

    /// <summary>Delete, overwrite, and reverse. Separated because these destroy work rather than adding it.</summary>
    Destructive
}

/// <summary>
/// The identity behind one MCP call: the name of the access token it presented and what
/// that token may do. <see cref="Name"/> is what lands in the audit log's actor column.
/// </summary>
public sealed record McpPrincipal(string? Name, IReadOnlyCollection<McpScope> Scopes)
{
    /// <summary>
    /// The principal used when no tokens are configured - every scope, no identity.
    ///
    /// This is deliberate, not an oversight: Modelibr has no authentication by design
    /// (local-first, single operator), so the default posture must stay exactly what it was
    /// before tokens existed - writes gated by <c>MCP_WRITE_ENABLED</c>, destructive work
    /// gated by its own flag. Configuring <c>MCP_TOKENS</c> is what turns identity on, and
    /// it is the prerequisite for exposing the endpoint beyond loopback.
    /// </summary>
    public static readonly McpPrincipal Unscoped =
        new(null, new[] { McpScope.Read, McpScope.Write, McpScope.Destructive });

    public bool Has(McpScope scope) => Scopes.Contains(scope);
}

/// <summary>
/// The configured MCP access tokens, parsed once at startup from <c>MCP_TOKENS</c>:
///
/// <code>MCP_TOKENS=curator:read,write:SECRET;janitor:read,write,destructive:SECRET2</code>
///
/// Secrets are held as SHA-256 hashes and compared in constant time, so a heap dump or a
/// timing probe does not hand over a working token. This mirrors the store import-token
/// pattern (short, opaque, scoped, presented as a bearer credential) rather than inventing
/// a second auth vocabulary.
///
/// Tokens live in configuration rather than the database on purpose: they are operator
/// infrastructure, not user data. The operator who can add one is the operator who can
/// already edit <c>.env</c>, revocation is a delete plus a restart, and there is no
/// half-built credential-management UI left behind in a product whose scope excludes auth.
/// </summary>
public sealed class McpTokenRegistry
{
    private sealed record Entry(string Name, byte[] SecretHash, IReadOnlyCollection<McpScope> Scopes);

    private readonly IReadOnlyList<Entry> _entries;

    private McpTokenRegistry(IReadOnlyList<Entry> entries) => _entries = entries;

    /// <summary>True once any token is configured - the point at which a caller must present one.</summary>
    public bool Enforced => _entries.Count > 0;

    /// <summary>Names of the configured tokens (never their secrets), for startup logging.</summary>
    public IReadOnlyList<string> TokenNames => _entries.Select(e => e.Name).ToList();

    public static McpTokenRegistry FromConfiguration(IConfiguration configuration)
    {
        var raw = configuration["MCP_TOKENS"];
        if (string.IsNullOrWhiteSpace(raw))
        {
            return new McpTokenRegistry(Array.Empty<Entry>());
        }

        var entries = new List<Entry>();
        foreach (var definition in raw.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            entries.Add(Parse(definition));
        }

        var duplicate = entries.GroupBy(e => e.Name, StringComparer.OrdinalIgnoreCase).FirstOrDefault(g => g.Count() > 1);
        if (duplicate is not null)
        {
            throw new InvalidOperationException(
                $"MCP_TOKENS defines the token name '{duplicate.Key}' more than once. Names identify the actor in the audit log, so they must be unique.");
        }

        return new McpTokenRegistry(entries);
    }

    /// <summary>
    /// The principal for a presented secret, or null when it matches no configured token.
    /// When nothing is configured this returns <see cref="McpPrincipal.Unscoped"/> for any
    /// input, including none - an unconfigured server is unauthenticated by design.
    /// </summary>
    public McpPrincipal? Resolve(string? presentedSecret)
    {
        if (!Enforced)
        {
            return McpPrincipal.Unscoped;
        }

        if (string.IsNullOrWhiteSpace(presentedSecret))
        {
            return null;
        }

        var presentedHash = Hash(presentedSecret);

        // Every entry is compared, and comparison is constant-time, so neither the number
        // of configured tokens nor how far a guess got is observable from response timing.
        McpPrincipal? matched = null;
        foreach (var entry in _entries)
        {
            if (CryptographicOperations.FixedTimeEquals(entry.SecretHash, presentedHash))
            {
                matched = new McpPrincipal(entry.Name, entry.Scopes);
            }
        }

        return matched;
    }

    private static Entry Parse(string definition)
    {
        // name:scope[,scope...]:secret - split into exactly 3 so a secret containing ':'
        // still parses (only the first two separators are structural).
        var parts = definition.Split(':', 3, StringSplitOptions.TrimEntries);
        if (parts.Length != 3)
        {
            throw new InvalidOperationException(
                $"MCP_TOKENS entry '{Redact(definition)}' is malformed. Expected name:scopes:secret, e.g. curator:read,write:SECRET.");
        }

        var (name, scopeList, secret) = (parts[0], parts[1], parts[2]);

        if (string.IsNullOrWhiteSpace(name))
        {
            throw new InvalidOperationException("An MCP_TOKENS entry has an empty name. The name is what identifies the actor in the audit log.");
        }

        if (string.IsNullOrWhiteSpace(secret))
        {
            throw new InvalidOperationException($"The MCP_TOKENS entry '{name}' has an empty secret.");
        }

        var scopes = new HashSet<McpScope>();
        foreach (var scope in scopeList.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (!Enum.TryParse<McpScope>(scope, ignoreCase: true, out var parsed) || !Enum.IsDefined(parsed))
            {
                throw new InvalidOperationException(
                    $"The MCP_TOKENS entry '{name}' names an unknown scope '{scope}'. Valid scopes: {string.Join(", ", Enum.GetNames<McpScope>()).ToLowerInvariant()}.");
            }

            scopes.Add(parsed);
        }

        if (scopes.Count == 0)
        {
            throw new InvalidOperationException($"The MCP_TOKENS entry '{name}' grants no scopes, so it can do nothing. Remove it or give it at least 'read'.");
        }

        // A write-capable token that cannot read would be able to change assets it can
        // never inspect - always a configuration mistake, so widen rather than surprise.
        scopes.Add(McpScope.Read);

        return new Entry(name, Hash(secret), scopes);
    }

    private static byte[] Hash(string secret) => SHA256.HashData(Encoding.UTF8.GetBytes(secret));

    /// <summary>Keeps a malformed entry's secret out of the startup exception and the logs.</summary>
    private static string Redact(string definition)
    {
        var firstSeparator = definition.IndexOf(':');
        return firstSeparator <= 0 ? "<unnamed>" : definition[..firstSeparator] + ":...";
    }
}

/// <summary>
/// The authenticated principal for the MCP request currently in flight, resolved by
/// <see cref="McpTokenEndpointFilter"/> and injected into tools that need to check a scope
/// or attribute a write.
/// </summary>
public sealed class McpCallerContext
{
    internal const string PrincipalItemKey = "Modelibr.Mcp.Principal";

    private readonly IHttpContextAccessor? _httpContextAccessor;
    private readonly McpPrincipal? _explicitPrincipal;

    public McpCallerContext(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    private McpCallerContext(McpPrincipal principal)
    {
        _explicitPrincipal = principal;
    }

    /// <summary>A caller carrying a known principal, for exercising scope gating without an HTTP request.</summary>
    public static McpCallerContext For(McpPrincipal principal) => new(principal);

    /// <summary>The unauthenticated local caller: every scope, no identity.</summary>
    public static McpCallerContext Unauthenticated() => For(McpPrincipal.Unscoped);

    /// <summary>
    /// Who is calling. Falls back to <see cref="McpPrincipal.Unscoped"/> when the call did
    /// not arrive through the filtered MCP endpoint (in-process tests, stdio hosting) - the
    /// filter is what rejects an invalid token, so reaching a tool at all means either a
    /// token checked out or none is configured.
    /// </summary>
    public McpPrincipal Principal =>
        _explicitPrincipal
        ?? (_httpContextAccessor?.HttpContext?.Items.TryGetValue(PrincipalItemKey, out var stored) == true
            && stored is McpPrincipal principal
                ? principal
                : McpPrincipal.Unscoped);

    /// <summary>The name recorded as the actor on anything this caller writes.</summary>
    public string? Actor => Principal.Name;

    /// <summary>
    /// Null when the caller holds <paramref name="scope"/>; otherwise the error body the
    /// tool should return. An agent that lacks a scope is told which one, so it stops
    /// retrying and asks the operator instead of burning turns.
    /// </summary>
    public object? Denied(McpScope scope)
    {
        if (Principal.Has(scope))
        {
            return null;
        }

        return new
        {
            error = "ScopeRequired",
            message = $"The access token '{Principal.Name}' does not hold the '{scope.ToString().ToLowerInvariant()}' scope.",
            granted = Principal.Scopes.Select(s => s.ToString().ToLowerInvariant()).ToArray(),
            remedy = "Ask the operator to widen this token's scopes in MCP_TOKENS, then restart the Web API.",
        };
    }
}

/// <summary>
/// Authenticates every request to the MCP endpoint when <c>MCP_TOKENS</c> is configured.
///
/// Applied at the transport rather than per tool so that adding a tool cannot forget it:
/// the baseline "a valid token, at all" is checked once here, and the finer-grained
/// write/destructive scopes are checked where those operations are performed.
/// </summary>
public sealed class McpTokenEndpointFilter : IEndpointFilter
{
    /// <summary>Non-standard alternative header, for MCP clients that cannot set Authorization.</summary>
    private const string TokenHeader = "X-Modelibr-Mcp-Token";

    private readonly McpTokenRegistry _registry;

    public McpTokenEndpointFilter(McpTokenRegistry registry) => _registry = registry;

    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        if (!_registry.Enforced)
        {
            return await next(context);
        }

        var principal = _registry.Resolve(ReadPresentedToken(context.HttpContext.Request));
        if (principal is null)
        {
            return Results.Unauthorized();
        }

        context.HttpContext.Items[McpCallerContext.PrincipalItemKey] = principal;
        return await next(context);
    }

    private static string? ReadPresentedToken(HttpRequest request)
    {
        var authorization = request.Headers.Authorization.FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(authorization) &&
            authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            return authorization["Bearer ".Length..].Trim();
        }

        return request.Headers[TokenHeader].FirstOrDefault();
    }
}
