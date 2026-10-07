using System.ComponentModel;
using ModelContextProtocol.Server;

namespace WebApi.Mcp;

/// <summary>
/// Hands a harness the Modelibr agent definitions in a neutral shape, so the harness's own
/// model can write them in whatever format it uses. It reads the same registry the agent
/// routes enforce, so setup cannot drift from the server. On <c>/mcp</c> only: no agent lists
/// it, so it is never part of a restricted agent's surface.
/// </summary>
[McpServerToolType]
public sealed class AgentSetupMcpTools
{
    private const string HowToInstall =
        "Create these agents in your own harness, in its native agent format. " +
        "1) Create each subagent with its name, description and instructions, and give it exactly one MCP server: " +
        "the URL of your current Modelibr MCP connection followed by the agent's mcpPath (\"https://host/mcp\" + \"/agents/designer\"), " +
        "using the same authentication as that connection. It must not see other Modelibr tools. " +
        "2) Create the main agent the same way, with its own mcpPath. It is the agent the user talks to, and it can hand work " +
        "to every subagent. If your harness has no separate main agent, put the main agent's instructions where your harness " +
        "keeps project instructions. " +
        "3) Tell the user which files you wrote and how to start the main agent.";

    [McpServerTool(Name = "get_agent_setup")]
    [Description("Describes the Modelibr agents (a main agent and its subagents) so you can create them in your own harness. Call this when the user asks to set up, create or install Modelibr agents.")]
    public static object GetAgentSetup(McpAgentRegistry registry) => new
    {
        howToInstall = HowToInstall,
        mainAgent = Describe(registry.Agents.Single(a => a.IsMain)),
        subagents = registry.Agents
            .Where(a => !a.IsMain)
            .Select(Describe)
            .ToArray(),
    };

    /// <summary>
    /// The agent's endpoint is given relative to the harness's own Modelibr URL rather than
    /// built from this request: behind a proxy (TLS termination, an <c>/api</c> prefix) the
    /// server cannot see the address the harness actually uses.
    /// </summary>
    private static object Describe(McpAgentDefinition agent) => new
    {
        name = agent.Name,
        description = agent.Description,
        instructions = agent.Instructions,
        mcpPath = $"/agents/{agent.Name}",
        tools = agent.Tools.Select(t => t.Name).ToArray(),
    };
}
