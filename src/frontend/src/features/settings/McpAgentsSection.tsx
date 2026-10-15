import { useQueryClient } from '@tanstack/react-query'
import { type JSX, useMemo, useState } from 'react'

import {
  type McpAgent,
  type McpAgentTool,
  type McpTool,
} from './api/mcpAgentsApi'
import {
  useMcpAgentsQuery,
  useMcpToolsQuery,
  useSettingsQuery,
} from './api/queries'
import { updateSetting } from './api/settingsApi'
import { SettingToggle } from './SettingToggle'

/** Above this many tools, the list collapses behind a summary. */
const TOOL_COLLAPSE_THRESHOLD = 3

/** Sentinel values for the agent filter, which also admits a real agent name. */
const ALL_TOOLS = '__all__'
const UNUSED_BY_AGENT = '__unused__'

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

/** The names of the agents that expose `tool`, in agent order. */
function agentsUsing(agents: McpAgent[], tool: McpTool): string[] {
  return agents
    .filter(agent => agent.tools.some(t => t.name === tool.name))
    .map(agent => agent.name)
}

/** Ordinal, so the list order does not depend on the runtime's locale. */
function ordinalByName(a: McpTool, b: McpTool): number {
  if (a.name < b.name) return -1
  if (a.name > b.name) return 1
  return 0
}

export function McpAgentsSection(): JSX.Element {
  const queryClient = useQueryClient()
  const {
    data: agentsData,
    isLoading: agentsLoading,
    isError: agentsIsError,
    error: agentsError,
  } = useMcpAgentsQuery()
  const {
    data: toolsData,
    isLoading: toolsLoading,
    isError: toolsIsError,
    error: toolsError,
  } = useMcpToolsQuery()
  const settingsQuery = useSettingsQuery()

  const [toolFilter, setToolFilter] = useState('')
  const [agentFilter, setAgentFilter] = useState(ALL_TOOLS)
  const [savingSettingKey, setSavingSettingKey] = useState<string | null>(null)
  const [settingError, setSettingError] = useState<string | null>(null)

  const saveSetting = async (key: string, next: boolean): Promise<void> => {
    setSavingSettingKey(key)
    setSettingError(null)
    try {
      await updateSetting(key, String(next))
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
    } catch (err) {
      setSettingError(
        err instanceof Error ? err.message : 'Failed to save MCP setting'
      )
    } finally {
      setSavingSettingKey(null)
    }
  }

  // Memoised so the derived lists below keep stable identities across renders.
  const agents = useMemo(() => agentsData ?? [], [agentsData])
  const tools = useMemo(() => toolsData ?? [], [toolsData])

  const usersByTool = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const tool of tools) {
      map.set(tool.name, agentsUsing(agents, tool))
    }
    return map
  }, [agents, tools])

  const unusedCount = tools.filter(
    tool => (usersByTool.get(tool.name) ?? []).length === 0
  ).length

  const visibleTools = useMemo(() => {
    const query = toolFilter.trim().toLowerCase()
    return [...tools].sort(ordinalByName).filter(tool => {
      if (
        query &&
        !tool.name.toLowerCase().includes(query) &&
        !tool.description.toLowerCase().includes(query)
      ) {
        return false
      }

      if (agentFilter === ALL_TOOLS) return true

      const users = usersByTool.get(tool.name) ?? []
      if (agentFilter === UNUSED_BY_AGENT) return users.length === 0
      return users.includes(agentFilter)
    })
  }, [tools, toolFilter, agentFilter, usersByTool])

  const isLoading = agentsLoading || toolsLoading
  const isError = agentsIsError || toolsIsError
  const error = agentsError ?? toolsError

  // Rendered in every state - when MCP is switched off the agent list cannot
  // load, and hiding the switch would leave no way to turn it back on.
  const settingsBlock = (
    <div className="mcp-settings-block">
      <SettingToggle
        id="mcpEnabled"
        label="MCP server"
        help="Serve the /mcp endpoint. Applies after restarting the app. MCP_ENABLED overrides this."
        isOn={settingsQuery.data?.mcpEnabled ?? true}
        disabled={!settingsQuery.data}
        saving={savingSettingKey === 'McpEnabled'}
        onChange={next => void saveSetting('McpEnabled', next)}
      />
      <SettingToggle
        id="mcpWriteEnabled"
        label="Allow write tools"
        help="Let agents create, tag and import. Applies after restarting the app. MCP_WRITE_ENABLED overrides this."
        isOn={settingsQuery.data?.mcpWriteEnabled ?? false}
        disabled={!settingsQuery.data}
        saving={savingSettingKey === 'McpWriteEnabled'}
        onChange={next => void saveSetting('McpWriteEnabled', next)}
      />
      <SettingToggle
        id="mcpDestructiveEnabled"
        label="Allow destructive tools"
        help="Let agents recycle assets and undo destructive writes. Applies after restarting the app. MCP_DESTRUCTIVE_ENABLED overrides this."
        isOn={settingsQuery.data?.mcpDestructiveEnabled ?? false}
        disabled={!settingsQuery.data}
        saving={savingSettingKey === 'McpDestructiveEnabled'}
        onChange={next => void saveSetting('McpDestructiveEnabled', next)}
      />
      {settingError && (
        <div className="settings-error">
          <strong>Error:</strong> {settingError}
        </div>
      )}
    </div>
  )

  if (isLoading) {
    return (
      <div className="mcp-agents-section">
        {settingsBlock}
        <div className="settings-help">Loading MCP agents…</div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="mcp-agents-section">
        {settingsBlock}
        <div className="settings-error">
          <strong>Error:</strong>{' '}
          {error instanceof Error ? error.message : 'Failed to load MCP agents'}
        </div>
      </div>
    )
  }

  return (
    <div className="mcp-agents-section">
      {settingsBlock}
      {agents.length === 0 ? (
        <div className="settings-help mcp-agents-empty">
          No MCP agents are available.
        </div>
      ) : (
        agents.map(agent => (
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
        ))
      )}

      <div className="mcp-tools-block">
        <div className="mcp-tools-header">
          <h4 className="mcp-tools-heading">Tools</h4>
          <span className="mcp-tools-summary">
            {tools.length} tools · {unusedCount} used by no agent
          </span>
        </div>

        <div className="mcp-tools-filters">
          <div className="mcp-tools-filter">
            <label
              className="mcp-tools-filter-label"
              htmlFor="mcp-tools-search"
            >
              Search tools
            </label>
            <input
              id="mcp-tools-search"
              type="search"
              className="mcp-tools-search"
              placeholder="Filter by name or description"
              value={toolFilter}
              onChange={event => setToolFilter(event.target.value)}
            />
          </div>
          <div className="mcp-tools-filter">
            <label
              className="mcp-tools-filter-label"
              htmlFor="mcp-tools-agent-filter"
            >
              Filter by agent
            </label>
            <select
              id="mcp-tools-agent-filter"
              className="mcp-tools-agent-select"
              value={agentFilter}
              onChange={event => setAgentFilter(event.target.value)}
            >
              <option value={ALL_TOOLS}>All tools</option>
              <option value={UNUSED_BY_AGENT}>Used by no agent</option>
              {agents.map(agent => (
                <option key={agent.name} value={agent.name}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {visibleTools.length === 0 ? (
          <div className="settings-help mcp-tools-empty">
            No tools match this filter.
          </div>
        ) : (
          <ul className="mcp-tools-list" aria-label="Registered MCP tools">
            {visibleTools.map(tool => {
              const users = usersByTool.get(tool.name) ?? []
              return (
                <li key={tool.name} className="mcp-tool-row">
                  <div className="mcp-tool-row-header">
                    <code className="mcp-tool-name">{tool.name}</code>
                    <div className="mcp-tool-agents">
                      {users.length === 0 ? (
                        <span className="mcp-tool-agent-chip mcp-tool-agent-chip-none">
                          no agent
                        </span>
                      ) : (
                        users.map(name => (
                          <span key={name} className="mcp-tool-agent-chip">
                            {name}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  {tool.description && (
                    <span className="mcp-tool-desc">{tool.description}</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <p className="settings-help mcp-agents-connect-hint">
        Connect a client to <code>/mcp/agents/&lt;name&gt;</code> to use an
        agent with only these tools.
      </p>
    </div>
  )
}
