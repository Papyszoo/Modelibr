using WebApi.Mcp;

namespace WebApi.Endpoints;

/// <summary>
/// The named MCP agents over REST, so a read-only Settings view can show what each one
/// exposes without opening a session. The definitions are the same ones the agent routes
/// enforce, so the view cannot drift from the server.
/// </summary>
public static class McpAgentEndpoints
{
    public static void MapMcpAgentEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/mcp-agents", GetAgents)
            .WithName("Get Mcp Agents")
            .WithSummary("The named MCP agents: description, asset families, and the tools each exposes")
            .WithOpenApi();
    }

    internal static IResult GetAgents(McpAgentRegistry registry) => Results.Ok(registry.Agents);
}
