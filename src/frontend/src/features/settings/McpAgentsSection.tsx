import { type JSX } from 'react'

import { type McpAgentTool } from './api/mcpAgentsApi'
import { useMcpAgentsQuery } from './api/queries'

/** Above this many tools, the list collapses behind a summary. */
const TOOL_COLLAPSE_THRESHOLD = 3

function ToolList({ tools }: { tools: McpAgentTool[] }): JSX.Element {
  return (
    <ul className="mcp-agents-tools">
      {tools.map(tool => (
        <li key={tool.name} className="mcp-agent-tool">
          <code className="mcp-agent-tool-name">{tool.name}</code>
          {tool.description && (
            <span className="mcp-agent-tool-desc">{tool.description}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

export function McpAgentsSection(): JSX.Element {
  const { data: agents, isLoading, isError, error } = useMcpAgentsQuery()

  if (isLoading) {
    return <div className="settings-help">Loading MCP agents…</div>
  }

  if (isError) {
    return (
      <div className="settings-error">
        <strong>Error:</strong>{' '}
        {error instanceof Error ? error.message : 'Failed to load MCP agents'}
      </div>
    )
  }

  if (!agents || agents.length === 0) {
    return (
      <div className="settings-help mcp-agents-empty">
        No MCP agents are available.
      </div>
    )
  }

  return (
    <div className="mcp-agents-section">
      {agents.map(agent => (
        <div key={agent.name} className="mcp-agent-card">
          <div className="mcp-agent-header">
            <span className="mcp-agent-name">{agent.name}</span>
            <div className="mcp-agent-families">
              {agent.families.map(family => (
                <span key={family} className="mcp-agent-family-chip">
                  {family}
                </span>
              ))}
            </div>
          </div>
          {agent.description && (
            <p className="mcp-agent-desc">{agent.description}</p>
          )}
          {agent.tools.length > 0 &&
            (agent.tools.length > TOOL_COLLAPSE_THRESHOLD ? (
              <details className="mcp-agent-tools-details">
                <summary>Tools ({agent.tools.length})</summary>
                <ToolList tools={agent.tools} />
              </details>
            ) : (
              <ToolList tools={agent.tools} />
            ))}
        </div>
      ))}

      <p className="settings-help mcp-agents-connect-hint">
        Connect a client to <code>/mcp/agents/&lt;name&gt;</code> to use an
        agent with only these tools.
      </p>
    </div>
  )
}
