import { client, UPLOAD_TIMEOUT } from '../../../lib/apiBase'
import { useApiCacheStore } from '../../../stores/apiCacheStore'
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
  if (!options.skipCache) {
    const cached = useApiCacheStore.getState().getProjects()
    if (cached) {
      return cached
    }
  }

  const response = await client.get<GetAllProjectsResponse>('/projects')

  useApiCacheStore.getState().setProjects(response.data.projects)

  return response.data.projects
}

export async function getProjectById(
  id: number,
  options: { skipCache?: boolean } = {}
): Promise<ProjectDto> {
  if (!options.skipCache) {
    const cached = useApiCacheStore.getState().getProjectById(id)
    if (cached) {
      return cached
    }
  }

  const response = await client.get<ProjectDto>(`/projects/${id}`)

  useApiCacheStore.getState().setProjectById(id, response.data)

  return response.data
}

export async function createProject(
  request: CreateProjectRequest
): Promise<CreateProjectResponse> {
  const response = await client.post<CreateProjectResponse>(
    '/projects',
    request
  )

  useApiCacheStore.getState().invalidateProjects()

  return response.data
}

export async function updateProject(
  id: number,
  request: UpdateProjectRequest
): Promise<void> {
  await client.put(`/projects/${id}`, request)

  useApiCacheStore.getState().invalidateProjects()
  useApiCacheStore.getState().invalidateProjectById(id)
}

export async function deleteProject(id: number): Promise<void> {
  await client.delete(`/projects/${id}`)

  useApiCacheStore.getState().invalidateProjects()
  useApiCacheStore.getState().invalidateProjectById(id)
}

export async function addModelToProject(
  projectId: number,
  modelId: number
): Promise<void> {
  await client.post(`/projects/${projectId}/models/${modelId}`)

  useApiCacheStore.getState().invalidateProjects()
  useApiCacheStore.getState().invalidateProjectById(projectId)
  useApiCacheStore.getState().invalidateModels()
  useApiCacheStore.getState().invalidateModelById(modelId.toString())
}

export async function removeModelFromProject(
  projectId: number,
  modelId: number
): Promise<void> {
  await client.delete(`/projects/${projectId}/models/${modelId}`)

  useApiCacheStore.getState().invalidateProjects()
  useApiCacheStore.getState().invalidateProjectById(projectId)
  useApiCacheStore.getState().invalidateModels()
  useApiCacheStore.getState().invalidateModelById(modelId.toString())
}

export async function addTextureSetToProject(
  projectId: number,
  textureSetId: number
): Promise<void> {
  await client.post(`/projects/${projectId}/texture-sets/${textureSetId}`)

  useApiCacheStore.getState().invalidateProjects()
  useApiCacheStore.getState().invalidateProjectById(projectId)
  useApiCacheStore.getState().invalidateTextureSets()
  useApiCacheStore.getState().invalidateTextureSetById(textureSetId)
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

  useApiCacheStore.getState().invalidateProjects()
  useApiCacheStore.getState().invalidateProjectById(projectId)
  useApiCacheStore.getState().invalidateTextureSets()

  return response.data
}

export async function removeTextureSetFromProject(
  projectId: number,
  textureSetId: number
): Promise<void> {
  await client.delete(`/projects/${projectId}/texture-sets/${textureSetId}`)

  useApiCacheStore.getState().invalidateProjects()
  useApiCacheStore.getState().invalidateProjectById(projectId)
  useApiCacheStore.getState().invalidateTextureSets()
  useApiCacheStore.getState().invalidateTextureSetById(textureSetId)
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

  useApiCacheStore.getState().invalidateProjects()
  useApiCacheStore.getState().invalidateProjectById(projectId)
}

export async function removeSpriteFromProject(
  projectId: number,
  spriteId: number
): Promise<void> {
  await client.delete(`/projects/${projectId}/sprites/${spriteId}`)

  useApiCacheStore.getState().invalidateProjects()
  useApiCacheStore.getState().invalidateProjectById(projectId)
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

  useApiCacheStore.getState().invalidateProjects()
  useApiCacheStore.getState().invalidateProjectById(projectId)
}

export async function removeSoundFromProject(
  projectId: number,
  soundId: number
): Promise<void> {
  await client.delete(`/projects/${projectId}/sounds/${soundId}`)

  useApiCacheStore.getState().invalidateProjects()
  useApiCacheStore.getState().invalidateProjectById(projectId)
}

export async function getSoundsByProject(
  projectId: number
): Promise<SoundDto[]> {
  const response = await client.get<GetAllSoundsResponse>(
    `/sounds?projectId=${projectId}`
  )
  return response.data.sounds
}
