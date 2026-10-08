@batch3 @mcp @mcp-agents
Feature: MCP agents and the explorer
    The agents Modelibr ships and the surface each one is allowed to see: the
    settings explorer that lists them, the registry the server enforces, and
    the refusal an agent-scoped session gives for a tool or asset family it was
    never granted.

    Scenario: The settings MCP explorer lists agents and their tools
        Given I am on the settings page
        When I open the "MCP explorer" settings section
        Then the MCP explorer should list the "modelibr" agent
        And the MCP explorer should list the registered tool "search_assets"

    Scenario: The MCP agents API exposes every configured agent and tool
        When an HTTP client lists the MCP agents
        Then the MCP agents should include "asset-scout"
        And every configured agent's tools should be registered

    Scenario: An agent-scoped session exposes only that agent's tools
        When an agent-scoped MCP client connects to "asset-scout"
        Then the session should expose exactly the "asset-scout" tools
        When that session calls "create_material"
        Then the session should refuse the tool as unknown

    Scenario: An agent cannot read an asset family outside its scope
        When an agent-scoped MCP client connects to "stylist"
        And that session reads a "Sound" asset
        Then the session should refuse the asset family

    Scenario: get_agent_setup describes the agents and is absent from an agent route
        When the main MCP client asks for the agent setup
        Then the agent setup should describe the main agent "modelibr"
        And the agent setup should list the subagent "asset-scout" with its path
        When an agent-scoped MCP client connects to "asset-scout"
        And that session asks for the agent setup
        Then the session should refuse the tool as unknown
