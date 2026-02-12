import { client, UPLOAD_TIMEOUT } from '../../../lib/apiBase'
import { Model } from '../../../utils/fileUtils'
import {
  ProjectDto,
  GetAllProjectsResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  UpdateProjectRequest,
  TextureSetDto,
  GetAllTextureSetsResponse,
  SpriteDto,
  GetAllSpritesResponse,
  SoundDto,
  GetAllSoundsResponse,
} from '../../../types'

export async function getAllProjects(
  options: { skipCache?: boolean } = {}
): Promise<ProjectDto[]> {
  void options
  const response = await client.get<GetAllProjectsResponse>('/projects')
  return response.data.projects
}

export async function getProjectById(
  id: number,
  options: { skipCache?: boolean } = {}
): Promise<ProjectDto> {
  void options
  const response = await client.get<ProjectDto>(`/projects/${id}`)
  return response.data
}

export async function createProject(
  request: CreateProjectRequest
): Promise<CreateProjectResponse> {
  const response = await client.post<CreateProjectResponse>(
    '/projects',
    request
  )
  return response.data
}

export async function updateProject(
  id: number,
  request: UpdateProjectRequest
): Promise<void> {
  await client.put(`/projects/${id}`, request)
}

export async function deleteProject(id: number): Promise<void> {
  await client.delete(`/projects/${id}`)
}

export async function addModelToProject(
  projectId: number,
  modelId: number
): Promise<void> {
  await client.post(`/projects/${projectId}/models/${modelId}`)
}

export async function removeModelFromProject(
  projectId: number,
  modelId: number
): Promise<void> {
  await client.delete(`/projects/${projectId}/models/${modelId}`)
}

export async function addTextureSetToProject(
  projectId: number,
  textureSetId: number
): Promise<void> {
  await client.post(`/projects/${projectId}/texture-sets/${textureSetId}`)
}

export async function addTextureToProjectWithFile(
  projectId: number,
  file: File,
  name: string,
  textureType: number,
  batchId?: string
): Promise<{ textureSetId: number }> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('name', name)
  formData.append('textureType', textureType.toString())

  const params = new URLSearchParams()
  if (batchId) {
    params.append('batchId', batchId)
  }
  params.append('uploadType', 'project')

  const response = await client.post<{ textureSetId: number }>(
    `/projects/${projectId}/textures/with-file?${params.toString()}`,
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

export async function removeTextureSetFromProject(
  projectId: number,
  textureSetId: number
): Promise<void> {
  await client.delete(`/projects/${projectId}/texture-sets/${textureSetId}`)
}

export async function getModelsByProject(projectId: number): Promise<Model[]> {
  const response = await client.get<Model[]>(`/models?projectId=${projectId}`)
  return response.data
}

export async function getTextureSetsByProject(
  projectId: number
): Promise<TextureSetDto[]> {
  const response = await client.get<GetAllTextureSetsResponse>(
    `/texture-sets?projectId=${projectId}`
  )
  return response.data.textureSets
}

export async function addSpriteToProject(
  projectId: number,
  spriteId: number
): Promise<void> {
  await client.post(`/projects/${projectId}/sprites/${spriteId}`)
}

export async function removeSpriteFromProject(
  projectId: number,
  spriteId: number
): Promise<void> {
  await client.delete(`/projects/${projectId}/sprites/${spriteId}`)
}

export async function getSpritesByProject(
  projectId: number
): Promise<SpriteDto[]> {
  const response = await client.get<GetAllSpritesResponse>(
    `/sprites?projectId=${projectId}`
  )
  return response.data.sprites
}

export async function addSoundToProject(
  projectId: number,
  soundId: number
): Promise<void> {
  await client.post(`/projects/${projectId}/sounds/${soundId}`)
}

export async function removeSoundFromProject(
  projectId: number,
  soundId: number
): Promise<void> {
  await client.delete(`/projects/${projectId}/sounds/${soundId}`)
}

export async function getSoundsByProject(
  projectId: number
): Promise<SoundDto[]> {
  const response = await client.get<GetAllSoundsResponse>(
    `/sounds?projectId=${projectId}`
  )
  return response.data.sounds
}
