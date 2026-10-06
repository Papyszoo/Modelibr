using System.ComponentModel;
using System.Reflection;
using System.Text.Json;
using ModelContextProtocol.Server;
using WebApi.Infrastructure;

namespace WebApi.Mcp;

/// <summary>One tool as an agent sees it, with the description the server advertises.</summary>
public sealed record McpAgentTool(string Name, string Description);

/// <summary>
/// A named agent: the subset of the tool surface it may see and the asset families it may
/// read across. Definitions live in <c>Mcp/mcp-agents.json</c> so an operator can add or
/// re-scope an agent without a code change.
/// </summary>
public sealed record McpAgentDefinition(
    string Name,
    string Description,
    IReadOnlyList<string> Families,
    IReadOnlyList<McpAgentTool> Tools)
{
    /// <summary>True when this agent may read <paramref name="family"/> (case-insensitive).</summary>
    public bool Allows(string family) =>
        Families.Contains(family, StringComparer.OrdinalIgnoreCase);

    /// <summary>True when <paramref name="tool"/> is one of the tools this agent exposes.</summary>
    public bool AllowsTool(string tool) =>
        Tools.Any(t => string.Equals(t.Name, tool, StringComparison.Ordinal));
}

/// <summary>
/// The configured MCP agents, loaded once at startup. Validation is deliberately fatal: an
/// agent that names a tool or family that does not exist would silently expose an empty (or
/// unrestricted) surface, which is worse than not starting.
/// </summary>
public sealed class McpAgentRegistry
{
    /// <summary>
    /// The asset-family vocabulary an agent may name. Kept beside <see cref="AgentAssetFamilies"/>
    /// rather than inside it because that file belongs to the upload-ticket filter.
    /// </summary>
    public static readonly IReadOnlyList<string> KnownFamilies =
    [
        AgentAssetFamilies.Model,
        AgentAssetFamilies.Sound,
        AgentAssetFamilies.Sprite,
        AgentAssetFamilies.EnvironmentMap,
        AgentAssetFamilies.TextureSet,
    ];

    private readonly IReadOnlyDictionary<string, McpAgentDefinition> _byName;

    private McpAgentRegistry(IReadOnlyList<McpAgentDefinition> agents)
    {
        Agents = agents;
        _byName = agents.ToDictionary(a => a.Name, StringComparer.OrdinalIgnoreCase);
    }

    /// <summary>Every configured agent, in file order.</summary>
    public IReadOnlyList<McpAgentDefinition> Agents { get; }

    /// <summary>The agent named <paramref name="name"/>, or null when none matches.</summary>
    public McpAgentDefinition? Find(string? name) =>
        !string.IsNullOrWhiteSpace(name) && _byName.TryGetValue(name, out var agent) ? agent : null;

    /// <summary>
    /// Reads and validates the definitions file. Throws when the file is missing, malformed,
    /// or names an unknown tool or family - all startup-time configuration errors.
    /// </summary>
    public static McpAgentRegistry FromFile(
        string path,
        IReadOnlyDictionary<string, string> knownTools)
    {
        if (!File.Exists(path))
        {
            throw new InvalidOperationException(
                $"The MCP agent definitions file was not found at '{path}'. It ships with the Web API as Mcp/mcp-agents.json.");
        }

        return Load(File.ReadAllText(path), knownTools, KnownFamilies);
    }

    /// <summary>Validates and builds a registry from the definitions file's JSON.</summary>
    public static McpAgentRegistry Load(
        string json,
        IReadOnlyDictionary<string, string> knownTools,
        IReadOnlyList<string> knownFamilies)
    {
        AgentFileEntry[] entries;
        try
        {
            entries = JsonSerializer.Deserialize<AgentFileEntry[]>(json, JsonOptions) ?? [];
        }
        catch (JsonException ex)
        {
            throw new InvalidOperationException($"The MCP agent definitions file is not valid JSON: {ex.Message}", ex);
        }

        var agents = new List<McpAgentDefinition>(entries.Length);
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var entry in entries)
        {
            if (string.IsNullOrWhiteSpace(entry.Name))
            {
                throw new InvalidOperationException("An MCP agent definition has an empty name.");
            }

            if (!names.Add(entry.Name))
            {
                throw new InvalidOperationException(
                    $"The MCP agent '{entry.Name}' is defined more than once.");
            }

            var families = new List<string>();
            foreach (var family in entry.Families ?? [])
            {
                var canonical = knownFamilies.FirstOrDefault(f => string.Equals(f, family, StringComparison.OrdinalIgnoreCase))
                    ?? throw new InvalidOperationException(
                        $"The MCP agent '{entry.Name}' names the unknown asset family '{family}'. Valid families: {string.Join(", ", knownFamilies)}.");

                families.Add(canonical);
            }

            var tools = new List<McpAgentTool>();
            foreach (var tool in entry.Tools ?? [])
            {
                if (!knownTools.TryGetValue(tool, out var description))
                {
                    throw new InvalidOperationException(
                        $"The MCP agent '{entry.Name}' names the unknown tool '{tool}'.");
                }

                tools.Add(new McpAgentTool(tool, description));
            }

            agents.Add(new McpAgentDefinition(
                entry.Name,
                entry.Description ?? string.Empty,
                families,
                tools));
        }

        return new McpAgentRegistry(agents);
    }

    /// <summary>
    /// Removes from a session's options every tool the agent does not expose. Applied once per
    /// session by <c>ConfigureSessionOptions</c>; the SDK hands that hook a fresh options
    /// instance, so removing tools cannot leak into another session or the <c>/mcp</c> route.
    /// </summary>
    public static void RestrictTools(McpServerOptions options, McpAgentDefinition agent)
    {
        if (options.ToolCollection is not { } tools)
        {
            return;
        }

        foreach (var tool in tools.ToArray())
        {
            if (!agent.AllowsTool(tool.ProtocolTool.Name))
            {
                tools.Remove(tool);
            }
        }
    }

    /// <summary>
    /// Every tool this assembly declares, name → description, whether or not the write gate
    /// would register it. The registry validates against this full set so a write-capable
    /// agent still validates on a read-only server; the session filter then naturally drops
    /// the tools that are not registered.
    /// </summary>
    public static IReadOnlyDictionary<string, string> DiscoverKnownTools(Assembly assembly)
    {
        var tools = new Dictionary<string, string>(StringComparer.Ordinal);

        foreach (var type in assembly.GetTypes())
        {
            if (type.GetCustomAttribute<McpServerToolTypeAttribute>() is null)
            {
                continue;
            }

            foreach (var method in type.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.Instance | BindingFlags.DeclaredOnly))
            {
                var attribute = method.GetCustomAttribute<McpServerToolAttribute>();
                if (attribute is null)
                {
                    continue;
                }

                tools[attribute.Name ?? method.Name] =
                    method.GetCustomAttribute<DescriptionAttribute>()?.Description ?? string.Empty;
            }
        }

        return tools;
    }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    /// <summary>The definitions file's shape; records because it is written by hand.</summary>
    private sealed record AgentFileEntry(
        string Name,
        string? Description,
        string[]? Families,
        string[]? Tools);
}

/// <summary>
/// Rejects a request for an agent that is not configured, and records the one that is on the
/// caller context so family-spanning tools can narrow themselves to it. Runs alongside
/// <see cref="McpTokenEndpointFilter"/> on <c>/mcp/agents/{agent}</c>; <c>/mcp</c> is untouched.
/// </summary>
public sealed class McpAgentEndpointFilter : IEndpointFilter
{
    /// <summary>The route value naming the agent. Shared with the route pattern in Program.</summary>
    public const string AgentRouteValue = "agent";

    private readonly McpAgentRegistry _registry;

    public McpAgentEndpointFilter(McpAgentRegistry registry) => _registry = registry;

    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var name = context.HttpContext.Request.RouteValues[AgentRouteValue] as string;
        var agent = _registry.Find(name);

        if (agent is null)
        {
            return Results.NotFound(new
            {
                error = "AgentNotFound",
                message = $"No MCP agent named '{name}' is configured.",
                remedy = $"Configured agents: {string.Join(", ", _registry.Agents.Select(a => a.Name))}.",
            });
        }

        context.HttpContext.Items[McpCallerContext.AgentItemKey] = agent;
        return await next(context);
    }
}
