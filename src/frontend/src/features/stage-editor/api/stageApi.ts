import { client } from '@/lib/apiBase'

export async function createStage(
  name: string,
  configurationJson: string
): Promise<{ id: number; name: string }> {
  const response = await client.post('/stages', {
    name,
    configurationJson,
  })
  return response.data
}

export async function getAllStages(): Promise<{
  stages: Array<{
    id: number
    name: string
    createdAt: string
    updatedAt: string
  }>
}> {
  const response = await client.get('/stages')
  return response.data
}

export async function getStageById(id: number): Promise<{
  id: number
  name: string
  configurationJson: string
  createdAt: string
  updatedAt: string
}> {
  const response = await client.get(`/stages/${id}`)
  return response.data
}

export async function updateStage(
  id: number,
  configurationJson: string
): Promise<{ id: number; name: string }> {
  const response = await client.put(`/stages/${id}`, {
    configurationJson,
  })
  return response.data
}
