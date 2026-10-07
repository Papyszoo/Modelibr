import { client } from '@/lib/apiBase'

export interface McpAgentTool {
  name: string
  description: string
}

export interface McpAgent {
  name: string
  description: string
  families: string[]
  tools: McpAgentTool[]
}

/** One tool the server currently registers, whatever agent exposes it. */
export interface McpTool {
  name: string
  description: string
}

export async function getMcpAgents(): Promise<McpAgent[]> {
  const response = await client.get('/mcp-agents')
  return response.data
}

export async function getMcpTools(): Promise<McpTool[]> {
  const response = await client.get('/mcp-tools')
  return response.data
}
