import { client } from '@/lib/apiBase'

import { type ScriptTemplateDto } from '../types'

export async function getAllScriptTemplates(): Promise<ScriptTemplateDto[]> {
  const response = await client.get<{ templates: ScriptTemplateDto[] }>(
    '/script-templates'
  )
  return response.data.templates
}

export async function createScriptTemplate(data: {
  name: string
  language: string
  content: string
  description?: string
}): Promise<ScriptTemplateDto> {
  const response = await client.post<ScriptTemplateDto>('/script-templates', {
    name: data.name,
    language: data.language,
    content: data.content,
    description: data.description ?? null,
  })
  return response.data
}

export async function updateScriptTemplate(
  id: number,
  data: {
    name: string
    language: string
    content: string
    description?: string
  }
): Promise<ScriptTemplateDto> {
  const response = await client.put<ScriptTemplateDto>(
    `/script-templates/${id}`,
    {
      name: data.name,
      language: data.language,
      content: data.content,
      description: data.description ?? null,
    }
  )
  return response.data
}

export async function deleteScriptTemplate(id: number): Promise<void> {
  await client.delete(`/script-templates/${id}`)
}
