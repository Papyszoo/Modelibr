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

export async function getMcpAgents(): Promise<McpAgent[]> {
  const response = await client.get('/mcp-agents')
  return response.data
}
