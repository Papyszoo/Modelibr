import { client, UPLOAD_TIMEOUT } from '@/lib/apiBase'

import {
  type GetAllScriptCategoriesResponse,
  type GetAllScriptsResponse,
  type ScriptDto,
} from '../../../types'

export async function getAllScripts(options?: {
  categoryIds?: number[]
  searchName?: string
  language?: string
}): Promise<GetAllScriptsResponse> {
  const params = new URLSearchParams()
  options?.categoryIds?.forEach(id =>
    params.append('categoryIds', id.toString())
  )
  if (options?.searchName && options.searchName.trim()) {
    params.append('searchName', options.searchName.trim())
  }
  if (options?.language && options.language.trim()) {
    params.append('language', options.language.trim())
  }

  const url = params.toString() ? `/scripts?${params.toString()}` : '/scripts'
  const response = await client.get<GetAllScriptsResponse>(url)
  return response.data
}

export async function getScriptsPaginated(options: {
  page: number
  pageSize: number
  packIds?: number[]
  projectIds?: number[]
  categoryIds?: number[]
  searchName?: string
  language?: string
}): Promise<{
  scripts: ScriptDto[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}> {
  const params = new URLSearchParams()
  params.append('page', options.page.toString())
  params.append('pageSize', options.pageSize.toString())
  options.packIds?.forEach(id => params.append('packIds', id.toString()))
  options.projectIds?.forEach(id => params.append('projectIds', id.toString()))
  options.categoryIds?.forEach(id =>
    params.append('categoryIds', id.toString())
  )
  if (options.searchName && options.searchName.trim()) {
    params.append('searchName', options.searchName.trim())
  }
  if (options.language && options.language.trim()) {
    params.append('language', options.language.trim())
  }

  const response = await client.get(`/scripts?${params.toString()}`)
  return response.data
}

export async function getScriptById(id: number): Promise<ScriptDto> {
  const response = await client.get<ScriptDto>(`/scripts/${id}`)
  return response.data
}

/** Fetches the raw source code of a script for the editor. */
export async function getScriptContent(id: number): Promise<string> {
  const response = await client.get<string>(`/scripts/${id}/file`, {
    responseType: 'text',
    transformResponse: [(data: string) => data],
  })
  return response.data
}

export async function createScript(options: {
  name: string
  language: string
  content?: string
  categoryId?: number
  description?: string
}): Promise<{
  scriptId: number
  name: string
  fileId: number
  language: string
  fileSizeBytes: number
}> {
  const response = await client.post('/scripts', {
    name: options.name,
    language: options.language,
    content: options.content ?? '',
    categoryId: options.categoryId ?? null,
    description: options.description ?? null,
  })
  return response.data
}

export async function createScriptWithFile(
  file: File,
  options?: {
    name?: string
    categoryId?: number
  }
): Promise<{
  scriptId: number
  name: string
  fileId: number
  language: string
  fileSizeBytes: number
}> {
  const formData = new FormData()
  formData.append('file', file)

  const params = new URLSearchParams()
  if (options?.name) params.append('name', options.name)
  if (options?.categoryId)
    params.append('categoryId', options.categoryId.toString())

  const response = await client.post(
    `/scripts/with-file?${params.toString()}`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: UPLOAD_TIMEOUT,
    }
  )

  return response.data
}

export async function updateScript(
  id: number,
  updates: {
    name?: string
    categoryId?: number | null
    // Include `description` only when you intend to change it — omitting the key
    // leaves the existing description intact; sending '' clears it.
    description?: string
  }
): Promise<{
  id: number
  name: string
  description: string | null
}> {
  const response = await client.put(`/scripts/${id}`, updates)
  return response.data
}

/** Saves edited source code; the backend re-points the script at a new file. */
export async function updateScriptContent(
  id: number,
  content: string
): Promise<{
  id: number
  fileId: number
  lineCount: number
  fileSizeBytes: number
}> {
  const response = await client.put(`/scripts/${id}/content`, { content })
  return response.data
}

export async function deleteScript(id: number): Promise<void> {
  await client.delete(`/scripts/${id}`)
}

export async function softDeleteScript(id: number): Promise<void> {
  await client.delete(`/scripts/${id}/soft`)
}

// Script Category methods

export async function getAllScriptCategories(): Promise<GetAllScriptCategoriesResponse> {
  const response =
    await client.get<GetAllScriptCategoriesResponse>('/script-categories')
  return response.data
}

export async function createScriptCategory(
  name: string,
  description?: string,
  parentId?: number | null
): Promise<{ id: number; name: string }> {
  const response = await client.post('/script-categories', {
    name,
    description,
    parentId: parentId ?? null,
  })
  return response.data
}

export async function updateScriptCategory(
  id: number,
  name: string,
  description?: string,
  parentId?: number | null
): Promise<{ id: number; name: string }> {
  const response = await client.put(`/script-categories/${id}`, {
    name,
    description,
    parentId: parentId ?? null,
  })
  return response.data
}

export async function deleteScriptCategory(id: number): Promise<void> {
  await client.delete(`/script-categories/${id}`)
}
