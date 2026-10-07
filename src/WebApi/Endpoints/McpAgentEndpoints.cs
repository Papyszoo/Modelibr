using ModelContextProtocol.Server;
using WebApi.Mcp;

namespace WebApi.Endpoints;

/// <summary>
/// The named MCP agents and the tool surface the server actually registers, over REST, so a
/// read-only Settings view can show what each agent exposes without opening a session. The
/// definitions are the same ones the agent routes enforce, so the view cannot drift from the
/// server.
/// </summary>
public static class McpAgentEndpoints
{
    public static void MapMcpAgentEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/mcp-agents", GetAgents)
            .WithName("Get Mcp Agents")
            .WithSummary("The named MCP agents: description, asset families, and the tools each exposes")
            .WithOpenApi();

        app.MapGet("/mcp-tools", GetTools)
            .WithName("Get Mcp Tools")
            .WithSummary("Every MCP tool the server currently registers, sorted by name")
            .WithOpenApi();
    }

    internal static IResult GetAgents(McpAgentRegistry registry) => Results.Ok(registry.Agents);

    /// <summary>
    /// The tools registered on the server, name → description. Resolved from the DI container
    /// rather than reflected from the assemblies, so it reflects the live registration: the
    /// write tools only appear when <c>MCP_WRITE_ENABLED</c> is on, and a tool that is not
    /// registered is not listed. Sorted ordinally so the Settings list is stable.
    /// </summary>
    internal static IResult GetTools(IEnumerable<McpServerTool> tools) =>
        Results.Ok(tools
            .Select(tool => new McpAgentTool(
                tool.ProtocolTool.Name,
                tool.ProtocolTool.Description ?? string.Empty))
            .OrderBy(tool => tool.Name, StringComparer.Ordinal)
            .ToArray());
}
