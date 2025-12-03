import axios, { AxiosInstance, AxiosResponse } from 'axios'
import { Model } from '../utils/fileUtils'
import {
  TextureSetDto,
  GetAllTextureSetsResponse,
  CreateTextureSetRequest,
  CreateTextureSetResponse,
  UpdateTextureSetRequest,
  UpdateTextureSetResponse,
  AddTextureToSetRequest,
  AddTextureToSetResponse,
  PackDto,
  GetAllPacksResponse,
  CreatePackRequest,
  CreatePackResponse,
  UpdatePackRequest,
  ModelVersionDto,
  CreateModelVersionResponse,
} from '../types'
import { useApiCacheStore } from '../stores/apiCacheStore'

export interface UploadModelResponse {
  id: number
  alreadyExists: boolean
}

export interface ThumbnailStatus {
  status: 'Pending' | 'Processing' | 'Ready' | 'Failed'
  fileUrl?: string
  sizeBytes?: number
  width?: number
  height?: number
  errorMessage?: string
  createdAt?: string
  processedAt?: string
}

class ApiClient {
  private baseURL: string
  private client: AxiosInstance

  constructor() {
    this.baseURL = import.meta.env.VITE_API_BASE_URL || 'https://localhost:8081'
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  getBaseURL(): string {
    return this.baseURL
  }

  async uploadModel(
    file: File,
    options: { batchId?: string } = {}
  ): Promise<UploadModelResponse> {
    const formData = new FormData()
    formData.append('file', file)

    // Build URL with query parameters
    let url = '/models'
    const params = new URLSearchParams()
    if (options.batchId) {
      params.append('batchId', options.batchId)
    }
    if (params.toString()) {
      url += `?${params.toString()}`
    }

    const response: AxiosResponse<UploadModelResponse> = await this.client.post(
      url,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    )

    // Invalidate models cache on successful upload
    useApiCacheStore.getState().invalidateModels()

    return response.data
  }

  async uploadFile(
    file: File,
    options: {
      batchId?: string
      uploadType?: string
      packId?: number
      modelId?: number
      textureSetId?: number
    } = {}
  ): Promise<{ fileId: number; alreadyExists: boolean }> {
    const formData = new FormData()
    formData.append('file', file)

    // Build URL with query parameters
    let url = '/files'
    const params = new URLSearchParams()
    if (options.batchId) {
      params.append('batchId', options.batchId)
    }
    if (options.uploadType) {
      params.append('uploadType', options.uploadType)
    }
    if (options.packId) {
      params.append('packId', options.packId.toString())
    }
    if (options.modelId) {
      params.append('modelId', options.modelId.toString())
    }
    if (options.textureSetId) {
      params.append('textureSetId', options.textureSetId.toString())
    }
    if (params.toString()) {
      url += `?${params.toString()}`
    }

    const response: AxiosResponse<{ fileId: number; alreadyExists: boolean }> =
      await this.client.post(url, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

    return response.data
  }

  async getModels(options: { skipCache?: boolean } = {}): Promise<Model[]> {
    // Check cache first unless skipCache is true
    if (!options.skipCache) {
      const cached = useApiCacheStore.getState().getModels()
      if (cached) {
        return cached
      }
    }

    const response: AxiosResponse<Model[]> = await this.client.get('/models')

    // Update cache
    useApiCacheStore.getState().setModels(response.data)

    return response.data
  }

  async getModelById(
    modelId: string,
    options: { skipCache?: boolean } = {}
  ): Promise<Model> {
    // Check cache first unless skipCache is true
    if (!options.skipCache) {
      const cached = useApiCacheStore.getState().getModelById(modelId)
      if (cached) {
        return cached
      }
    }

    const response: AxiosResponse<Model> = await this.client.get(
      `/models/${modelId}`
    )

    // Update cache
    useApiCacheStore.getState().setModelById(modelId, response.data)

    return response.data
  }

  getModelFileUrl(modelId: string): string {
    return `${this.baseURL}/models/${modelId}/file`
  }

  getFileUrl(fileId: string): string {
    return `${this.baseURL}/files/${fileId}`
  }

  // Thumbnail methods
  async getThumbnailStatus(
    modelId: string,
    options: { skipCache?: boolean } = {}
  ): Promise<ThumbnailStatus> {
    // Check cache first unless skipCache is true
    if (!options.skipCache) {
      const cached = useApiCacheStore.getState().getThumbnailStatus(modelId)
      if (cached) {
        return cached
      }
    }

    const response: AxiosResponse<ThumbnailStatus> = await this.client.get(
      `/models/${modelId}/thumbnail`
    )

    // Update cache
    useApiCacheStore.getState().setThumbnailStatus(modelId, response.data)

    return response.data
  }

  getThumbnailUrl(modelId: string): string {
    return `${this.baseURL}/models/${modelId}/thumbnail/file`
  }

  async getThumbnailFile(
    modelId: string,
    options: { skipCache?: boolean } = {}
  ): Promise<Blob> {
    // Check cache first unless skipCache is true
    if (!options.skipCache) {
      const cached = useApiCacheStore.getState().getThumbnailBlob(modelId)
      if (cached) {
        return cached
      }
    }

    const response: AxiosResponse<Blob> = await this.client.get(
      `/models/${modelId}/thumbnail/file`,
      { responseType: 'blob' }
    )

    // Update cache
    useApiCacheStore.getState().setThumbnailBlob(modelId, response.data)

    return response.data
  }

  async regenerateThumbnail(modelId: string): Promise<void> {
    const response: AxiosResponse<void> = await this.client.post(
      `/models/${modelId}/thumbnail/regenerate`
    )

    // Invalidate thumbnail cache for this model
    useApiCacheStore.getState().invalidateThumbnailById(modelId)

    return response.data
  }

  // TextureSet methods
  async getAllTextureSets(
    options: { skipCache?: boolean } = {}
  ): Promise<TextureSetDto[]> {
    // Check cache first unless skipCache is true
    if (!options.skipCache) {
      const cached = useApiCacheStore.getState().getTextureSets()
      if (cached) {
        return cached
      }
    }

    const response: AxiosResponse<GetAllTextureSetsResponse> =
      await this.client.get('/texture-sets')

    // Update cache
    useApiCacheStore.getState().setTextureSets(response.data.textureSets)

    return response.data.textureSets
  }

  async getTextureSetById(
    id: number,
    options: { skipCache?: boolean } = {}
  ): Promise<TextureSetDto> {
    // Check cache first unless skipCache is true
    if (!options.skipCache) {
      const cached = useApiCacheStore.getState().getTextureSetById(id)
      if (cached) {
        return cached
      }
    }

    const response: AxiosResponse<TextureSetDto> = await this.client.get(
      `/texture-sets/${id}`
    )

    // Update cache
    useApiCacheStore.getState().setTextureSetById(id, response.data)

    return response.data
  }

  async getTextureSetByFileId(
    fileId: number
  ): Promise<{ textureSetId: number | null }> {
    const response: AxiosResponse<{ textureSetId: number | null }> =
      await this.client.get(`/texture-sets/by-file/${fileId}`)
    return response.data
  }

  async createTextureSet(
    request: CreateTextureSetRequest
  ): Promise<CreateTextureSetResponse> {
    const response: AxiosResponse<CreateTextureSetResponse> =
      await this.client.post('/texture-sets', request)

    // Invalidate texture sets cache on successful creation
    useApiCacheStore.getState().invalidateTextureSets()

    return response.data
  }

  async createTextureSetWithFile(
    file: File,
    options?: { name?: string; textureType?: string; batchId?: string }
  ): Promise<{
    textureSetId: number
    name: string
    fileId: number
    textureId: number
    textureType: string
  }> {
    const formData = new FormData()
    formData.append('file', file)

    const params = new URLSearchParams()
    if (options?.name) params.append('name', options.name)
    if (options?.textureType) params.append('textureType', options.textureType)
    if (options?.batchId) params.append('batchId', options.batchId)

    const response = await this.client.post(
      `/texture-sets/with-file?${params.toString()}`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    )

    // Invalidate texture sets cache on successful creation
    useApiCacheStore.getState().invalidateTextureSets()

    return response.data
  }

  async updateTextureSet(
    id: number,
    request: UpdateTextureSetRequest
  ): Promise<UpdateTextureSetResponse> {
    const response: AxiosResponse<UpdateTextureSetResponse> =
      await this.client.put(`/texture-sets/${id}`, request)

    // Invalidate texture sets cache on successful update
    useApiCacheStore.getState().invalidateTextureSets()
    useApiCacheStore.getState().invalidateTextureSetById(id)

    return response.data
  }

  async deleteTextureSet(id: number): Promise<void> {
    await this.client.delete(`/texture-sets/${id}`)

    // Invalidate texture sets cache on successful deletion
    useApiCacheStore.getState().invalidateTextureSets()
    useApiCacheStore.getState().invalidateTextureSetById(id)
  }

  async hardDeleteTextureSet(id: number): Promise<void> {
    await this.client.delete(`/texture-sets/${id}/hard`)

    // Invalidate texture sets cache on successful deletion
    useApiCacheStore.getState().invalidateTextureSets()
    useApiCacheStore.getState().invalidateTextureSetById(id)
  }

  async addTextureToSetEndpoint(
    setId: number,
    request: AddTextureToSetRequest
  ): Promise<AddTextureToSetResponse> {
    const response: AxiosResponse<AddTextureToSetResponse> =
      await this.client.post(`/texture-sets/${setId}/textures`, request)

    // Invalidate texture sets cache when textures are added
    useApiCacheStore.getState().invalidateTextureSets()
    useApiCacheStore.getState().invalidateTextureSetById(setId)

    return response.data
  }

  async removeTextureFromSet(setId: number, textureId: number): Promise<void> {
    await this.client.delete(`/texture-sets/${setId}/textures/${textureId}`)

    // Invalidate texture sets cache when textures are removed
    useApiCacheStore.getState().invalidateTextureSets()
    useApiCacheStore.getState().invalidateTextureSetById(setId)
  }

  async changeTextureType(
    setId: number,
    textureId: number,
    newTextureType: number
  ): Promise<void> {
    await this.client.put(`/texture-sets/${setId}/textures/${textureId}/type`, {
      textureType: newTextureType,
    })

    // Invalidate texture sets cache when texture types change
    useApiCacheStore.getState().invalidateTextureSets()
    useApiCacheStore.getState().invalidateTextureSetById(setId)
  }

  async associateTextureSetWithModel(
    setId: number,
    modelId: number
  ): Promise<void> {
    await this.client.post(`/texture-sets/${setId}/models/${modelId}`)

    // Invalidate texture sets and models cache when associations change
    useApiCacheStore.getState().invalidateTextureSets()
    useApiCacheStore.getState().invalidateTextureSetById(setId)
    useApiCacheStore.getState().invalidateModels()
    useApiCacheStore.getState().invalidateModelById(modelId.toString())
  }

  async disassociateTextureSetFromModel(
    setId: number,
    modelId: number
  ): Promise<void> {
    await this.client.delete(`/texture-sets/${setId}/models/${modelId}`)

    // Invalidate texture sets and models cache when associations change
    useApiCacheStore.getState().invalidateTextureSets()
    useApiCacheStore.getState().invalidateTextureSetById(setId)
    useApiCacheStore.getState().invalidateModels()
    useApiCacheStore.getState().invalidateModelById(modelId.toString())
  }

  // Settings API
  async getSettings(): Promise<{
    maxFileSizeBytes: number
    maxThumbnailSizeBytes: number
    thumbnailFrameCount: number
    thumbnailCameraVerticalAngle: number
    thumbnailWidth: number
    thumbnailHeight: number
    generateThumbnailOnUpload: boolean
    createdAt: string
    updatedAt: string
  }> {
    const response = await this.client.get('/settings')
    return response.data
  }

  async updateSettings(settings: {
    maxFileSizeBytes: number
    maxThumbnailSizeBytes: number
    thumbnailFrameCount: number
    thumbnailCameraVerticalAngle: number
    thumbnailWidth: number
    thumbnailHeight: number
    generateThumbnailOnUpload: boolean
  }): Promise<{
    maxFileSizeBytes: number
    maxThumbnailSizeBytes: number
    thumbnailFrameCount: number
    thumbnailCameraVerticalAngle: number
    thumbnailWidth: number
    thumbnailHeight: number
    generateThumbnailOnUpload: boolean
    updatedAt: string
  }> {
    const response = await this.client.put('/settings', settings)
    return response.data
  }

  // Model tags API
  async updateModelTags(
    modelId: string,
    tags: string,
    description: string
  ): Promise<{
    modelId: number
    tags: string
    description: string
  }> {
    const response = await this.client.post(`/models/${modelId}/tags`, {
      tags,
      description,
    })
    return response.data
  }

  // Pack API methods
  async getAllPacks(options: { skipCache?: boolean } = {}): Promise<PackDto[]> {
    // Check cache first unless skipCache is true
    if (!options.skipCache) {
      const cached = useApiCacheStore.getState().getPacks()
      if (cached) {
        return cached
      }
    }

    const response = await this.client.get<GetAllPacksResponse>('/packs')

    // Update cache
    useApiCacheStore.getState().setPacks(response.data.packs)

    return response.data.packs
  }

  async getPackById(
    id: number,
    options: { skipCache?: boolean } = {}
  ): Promise<PackDto> {
    // Check cache first unless skipCache is true
    if (!options.skipCache) {
      const cached = useApiCacheStore.getState().getPackById(id)
      if (cached) {
        return cached
      }
    }

    const response = await this.client.get<PackDto>(`/packs/${id}`)

    // Update cache
    useApiCacheStore.getState().setPackById(id, response.data)

    return response.data
  }

  async createPack(request: CreatePackRequest): Promise<CreatePackResponse> {
    const response = await this.client.post<CreatePackResponse>(
      '/packs',
      request
    )

    // Invalidate packs cache on successful creation
    useApiCacheStore.getState().invalidatePacks()

    return response.data
  }

  async updatePack(id: number, request: UpdatePackRequest): Promise<void> {
    await this.client.put(`/packs/${id}`, request)

    // Invalidate packs cache on successful update
    useApiCacheStore.getState().invalidatePacks()
    useApiCacheStore.getState().invalidatePackById(id)
  }

  async deletePack(id: number): Promise<void> {
    await this.client.delete(`/packs/${id}`)

    // Invalidate packs cache on successful deletion
    useApiCacheStore.getState().invalidatePacks()
    useApiCacheStore.getState().invalidatePackById(id)
  }

  async addModelToPack(packId: number, modelId: number): Promise<void> {
    await this.client.post(`/packs/${packId}/models/${modelId}`)

    // Invalidate packs and models cache when associations change
    useApiCacheStore.getState().invalidatePacks()
    useApiCacheStore.getState().invalidatePackById(packId)
    useApiCacheStore.getState().invalidateModels()
    useApiCacheStore.getState().invalidateModelById(modelId.toString())
  }

  async removeModelFromPack(packId: number, modelId: number): Promise<void> {
    await this.client.delete(`/packs/${packId}/models/${modelId}`)

    // Invalidate packs and models cache when associations change
    useApiCacheStore.getState().invalidatePacks()
    useApiCacheStore.getState().invalidatePackById(packId)
    useApiCacheStore.getState().invalidateModels()
    useApiCacheStore.getState().invalidateModelById(modelId.toString())
  }

  async addTextureSetToPack(
    packId: number,
    textureSetId: number
  ): Promise<void> {
    await this.client.post(`/packs/${packId}/texture-sets/${textureSetId}`)

    // Invalidate packs and texture sets cache when associations change
    useApiCacheStore.getState().invalidatePacks()
    useApiCacheStore.getState().invalidatePackById(packId)
    useApiCacheStore.getState().invalidateTextureSets()
    useApiCacheStore.getState().invalidateTextureSetById(textureSetId)
  }

  async addTextureToPackWithFile(
    packId: number,
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
    params.append('uploadType', 'pack')

    const response = await this.client.post<{ textureSetId: number }>(
      `/packs/${packId}/textures/with-file?${params.toString()}`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    )

    // Invalidate caches
    useApiCacheStore.getState().invalidatePacks()
    useApiCacheStore.getState().invalidatePackById(packId)
    useApiCacheStore.getState().invalidateTextureSets()

    return response.data
  }

  async removeTextureSetFromPack(
    packId: number,
    textureSetId: number
  ): Promise<void> {
    await this.client.delete(`/packs/${packId}/texture-sets/${textureSetId}`)

    // Invalidate packs and texture sets cache when associations change
    useApiCacheStore.getState().invalidatePacks()
    useApiCacheStore.getState().invalidatePackById(packId)
    useApiCacheStore.getState().invalidateTextureSets()
    useApiCacheStore.getState().invalidateTextureSetById(textureSetId)
  }

  async getModelsByPack(packId: number): Promise<Model[]> {
    const response = await this.client.get<Model[]>(`/models?packId=${packId}`)
    return response.data
  }

  async getTextureSetsByPack(packId: number): Promise<TextureSetDto[]> {
    const response = await this.client.get<GetAllTextureSetsResponse>(
      `/texture-sets?packId=${packId}`
    )
    return response.data.textureSets
  }

  // Project API
  async getAllProjects(
    options: { skipCache?: boolean } = {}
  ): Promise<ProjectDto[]> {
    // Check cache first unless skipCache is true
    if (!options.skipCache) {
      const cached = useApiCacheStore.getState().getProjects()
      if (cached) {
        return cached
      }
    }

    const response = await this.client.get<GetAllProjectsResponse>('/projects')

    // Update cache
    useApiCacheStore.getState().setProjects(response.data.projects)

    return response.data.projects
  }

  async getProjectById(
    id: number,
    options: { skipCache?: boolean } = {}
  ): Promise<ProjectDto> {
    // Check cache first unless skipCache is true
    if (!options.skipCache) {
      const cached = useApiCacheStore.getState().getProjectById(id)
      if (cached) {
        return cached
      }
    }

    const response = await this.client.get<ProjectDto>(`/projects/${id}`)

    // Update cache
    useApiCacheStore.getState().setProjectById(id, response.data)

    return response.data
  }

  async createProject(
    request: CreateProjectRequest
  ): Promise<CreateProjectResponse> {
    const response = await this.client.post<CreateProjectResponse>(
      '/projects',
      request
    )

    // Invalidate projects cache on successful creation
    useApiCacheStore.getState().invalidateProjects()

    return response.data
  }

  async updateProject(
    id: number,
    request: UpdateProjectRequest
  ): Promise<void> {
    await this.client.put(`/projects/${id}`, request)

    // Invalidate projects cache on successful update
    useApiCacheStore.getState().invalidateProjects()
    useApiCacheStore.getState().invalidateProjectById(id)
  }

  async deleteProject(id: number): Promise<void> {
    await this.client.delete(`/projects/${id}`)

    // Invalidate projects cache on successful deletion
    useApiCacheStore.getState().invalidateProjects()
    useApiCacheStore.getState().invalidateProjectById(id)
  }

  async addModelToProject(projectId: number, modelId: number): Promise<void> {
    await this.client.post(`/projects/${projectId}/models/${modelId}`)

    // Invalidate projects and models cache when associations change
    useApiCacheStore.getState().invalidateProjects()
    useApiCacheStore.getState().invalidateProjectById(projectId)
    useApiCacheStore.getState().invalidateModels()
    useApiCacheStore.getState().invalidateModelById(modelId.toString())
  }

  async removeModelFromProject(
    projectId: number,
    modelId: number
  ): Promise<void> {
    await this.client.delete(`/projects/${projectId}/models/${modelId}`)

    // Invalidate projects and models cache when associations change
    useApiCacheStore.getState().invalidateProjects()
    useApiCacheStore.getState().invalidateProjectById(projectId)
    useApiCacheStore.getState().invalidateModels()
    useApiCacheStore.getState().invalidateModelById(modelId.toString())
  }

  async addTextureSetToProject(
    projectId: number,
    textureSetId: number
  ): Promise<void> {
    await this.client.post(
      `/projects/${projectId}/texture-sets/${textureSetId}`
    )

    // Invalidate projects and texture sets cache when associations change
    useApiCacheStore.getState().invalidateProjects()
    useApiCacheStore.getState().invalidateProjectById(projectId)
    useApiCacheStore.getState().invalidateTextureSets()
    useApiCacheStore.getState().invalidateTextureSetById(textureSetId)
  }

  async addTextureToProjectWithFile(
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

    const response = await this.client.post<{ textureSetId: number }>(
      `/projects/${projectId}/textures/with-file?${params.toString()}`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    )

    // Invalidate caches
    useApiCacheStore.getState().invalidateProjects()
    useApiCacheStore.getState().invalidateProjectById(projectId)
    useApiCacheStore.getState().invalidateTextureSets()

    return response.data
  }

  async removeTextureSetFromProject(
    projectId: number,
    textureSetId: number
  ): Promise<void> {
    await this.client.delete(
      `/projects/${projectId}/texture-sets/${textureSetId}`
    )

    // Invalidate projects and texture sets cache when associations change
    useApiCacheStore.getState().invalidateProjects()
    useApiCacheStore.getState().invalidateProjectById(projectId)
    useApiCacheStore.getState().invalidateTextureSets()
    useApiCacheStore.getState().invalidateTextureSetById(textureSetId)
  }

  async getModelsByProject(projectId: number): Promise<Model[]> {
    const response = await this.client.get<Model[]>(
      `/models?projectId=${projectId}`
    )
    return response.data
  }

  async getTextureSetsByProject(projectId: number): Promise<TextureSetDto[]> {
    const response = await this.client.get<GetAllTextureSetsResponse>(
      `/texture-sets?projectId=${projectId}`
    )
    return response.data.textureSets
  }

  // Batch Upload History API
  async getBatchUploadHistory(): Promise<{
    uploads: Array<{
      id: number
      batchId: string
      uploadType: string
      uploadedAt: string
      fileId: number
      fileName: string
      packId: number | null
      packName: string | null
      projectId: number | null
      projectName: string | null
      modelId: number | null
      modelName: string | null
      textureSetId: number | null
      textureSetName: string | null
    }>
  }> {
    const response = await this.client.get('/batch-uploads/history')
    return response.data
  }

  // Stage API
  async createStage(
    name: string,
    configurationJson: string
  ): Promise<{ id: number; name: string }> {
    const response = await this.client.post('/stages', {
      name,
      configurationJson,
    })
    return response.data
  }

  async getAllStages(): Promise<{
    stages: Array<{
      id: number
      name: string
      createdAt: string
      updatedAt: string
    }>
  }> {
    const response = await this.client.get('/stages')
    return response.data
  }

  async getStageById(id: number): Promise<{
    id: number
    name: string
    configurationJson: string
    createdAt: string
    updatedAt: string
  }> {
    const response = await this.client.get(`/stages/${id}`)
    return response.data
  }

  async updateStage(
    id: number,
    configurationJson: string
  ): Promise<{ id: number; name: string }> {
    const response = await this.client.put(`/stages/${id}`, {
      configurationJson,
    })
    return response.data
  }

  async setDefaultTextureSet(
    modelId: number,
    textureSetId: number | null
  ): Promise<{ modelId: number; defaultTextureSetId: number | null }> {
    const response = await this.client.put(
      `/models/${modelId}/defaultTextureSet`,
      null,
      {
        params: { textureSetId },
      }
    )

    // Invalidate model cache when default texture set changes
    useApiCacheStore.getState().invalidateModels()
    useApiCacheStore.getState().invalidateModelById(modelId.toString())

    return response.data
  }

  // Cache management methods
  refreshCache(type?: 'models' | 'textureSets' | 'packs'): void {
    const store = useApiCacheStore.getState()
    if (!type) {
      store.invalidateAll()
    } else if (type === 'models') {
      store.refreshModels()
    } else if (type === 'textureSets') {
      store.refreshTextureSets()
    } else if (type === 'packs') {
      store.refreshPacks()
    }
  }

  // Model Version API methods
  async getModelVersions(modelId: number): Promise<ModelVersionDto[]> {
    const response = await this.client.get<ModelVersionDto[]>(
      `/models/${modelId}/versions`
    )
    return response.data
  }

  async getModelVersion(
    modelId: number,
    versionId: number
  ): Promise<ModelVersionDto> {
    const response = await this.client.get<ModelVersionDto>(
      `/models/${modelId}/versions/${versionId}`
    )
    return response.data
  }

  async createModelVersion(
    modelId: number,
    file: File,
    description?: string
  ): Promise<CreateModelVersionResponse> {
    const formData = new FormData()
    formData.append('file', file)

    const params = new URLSearchParams()
    if (description) {
      params.append('description', description)
    }

    const url = `/models/${modelId}/versions${params.toString() ? `?${params.toString()}` : ''}`

    const response = await this.client.post<CreateModelVersionResponse>(
      url,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    )

    // Invalidate model cache when new version is created
    useApiCacheStore.getState().invalidateModels()
    useApiCacheStore.getState().invalidateModelById(modelId.toString())

    return response.data
  }

  async addFileToVersion(
    modelId: number,
    versionId: number,
    file: File
  ): Promise<CreateModelVersionResponse> {
    const formData = new FormData()
    formData.append('file', file)

    const url = `/models/${modelId}/versions/${versionId}/files`

    const response = await this.client.post<CreateModelVersionResponse>(
      url,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    )

    // Invalidate model cache when file is added to version
    useApiCacheStore.getState().invalidateModels()
    useApiCacheStore.getState().invalidateModelById(modelId.toString())

    return response.data
  }

  getVersionFileUrl(
    modelId: number,
    versionId: number,
    fileId: number
  ): string {
    return `${this.baseURL}/models/${modelId}/versions/${versionId}/files/${fileId}`
  }

  // Recycled Files methods
  async getAllRecycledFiles(): Promise<{
    models: any[]
    modelVersions: any[]
    files: any[]
    textureSets: any[]
    textures: any[]
  }> {
    const response = await this.client.get('/recycled')
    return response.data
  }

  async restoreEntity(entityType: string, entityId: number): Promise<void> {
    await this.client.post(`/recycled/${entityType}/${entityId}/restore`)

    // Invalidate cache based on entity type so restored items appear in lists
    switch (entityType.toLowerCase()) {
      case 'model':
        useApiCacheStore.getState().invalidateModels()
        useApiCacheStore.getState().invalidateModelById(entityId.toString())
        break
      case 'textureset':
        useApiCacheStore.getState().invalidateTextureSets()
        useApiCacheStore.getState().invalidateTextureSetById(entityId)
        break
    }
  }

  async getDeletePreview(
    entityType: string,
    entityId: number
  ): Promise<{
    entityName: string
    filesToDelete: Array<{
      filePath: string
      originalFileName: string
      sizeBytes: number
    }>
    relatedEntities: string[]
  }> {
    const response = await this.client.get(
      `/recycled/${entityType}/${entityId}/preview`
    )
    return response.data
  }

  async permanentlyDeleteEntity(
    entityType: string,
    entityId: number
  ): Promise<void> {
    await this.client.delete(`/recycled/${entityType}/${entityId}/permanent`)
  }

  async softDeleteModel(modelId: number): Promise<void> {
    await this.client.delete(`/models/${modelId}`)

    // Invalidate cache on successful soft delete
    useApiCacheStore.getState().invalidateModels()
    useApiCacheStore.getState().invalidateModelById(modelId.toString())
  }

  async softDeleteTextureSet(textureSetId: number): Promise<void> {
    await this.client.delete(`/texture-sets/${textureSetId}`)

    // Invalidate cache on successful soft delete
    useApiCacheStore.getState().invalidateTextureSets()
    useApiCacheStore.getState().invalidateTextureSetById(textureSetId)
  }

  // Sprite methods
  async getAllSprites(): Promise<{
    sprites: Array<{
      id: number
      name: string
      fileId: number
      spriteType: number
      categoryId: number | null
      categoryName: string | null
      fileName: string
      fileSizeBytes: number
      createdAt: string
      updatedAt: string
    }>
  }> {
    const response = await this.client.get('/sprites')
    return response.data
  }

  async getSpriteById(id: number): Promise<{
    id: number
    name: string
    fileId: number
    spriteType: number
    categoryId: number | null
    categoryName: string | null
    fileName: string
    fileSizeBytes: number
    createdAt: string
    updatedAt: string
  }> {
    const response = await this.client.get(`/sprites/${id}`)
    return response.data
  }

  async createSpriteWithFile(
    file: File,
    options?: {
      name?: string
      spriteType?: number
      categoryId?: number
      batchId?: string
    }
  ): Promise<{
    spriteId: number
    name: string
    fileId: number
    spriteType: number
    fileSizeBytes: number
  }> {
    const formData = new FormData()
    formData.append('file', file)

    const params = new URLSearchParams()
    if (options?.name) params.append('name', options.name)
    if (options?.spriteType !== undefined)
      params.append('spriteType', options.spriteType.toString())
    if (options?.categoryId !== undefined)
      params.append('categoryId', options.categoryId.toString())
    if (options?.batchId) params.append('batchId', options.batchId)

    const response = await this.client.post(
      `/sprites/with-file?${params.toString()}`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    )

    return response.data
  }

  // Sprite Category methods
  async getAllSpriteCategories(): Promise<{
    categories: Array<{
      id: number
      name: string
      description: string | null
      createdAt: string
      updatedAt: string
    }>
  }> {
    const response = await this.client.get('/sprite-categories')
    return response.data
  }

  async createSpriteCategory(
    name: string,
    description?: string
  ): Promise<{
    id: number
    name: string
    description: string | null
  }> {
    const response = await this.client.post('/sprite-categories', {
      name,
      description,
    })
    return response.data
  }

  async updateSpriteCategory(
    id: number,
    name: string,
    description?: string
  ): Promise<{
    id: number
    name: string
    description: string | null
  }> {
    const response = await this.client.put(`/sprite-categories/${id}`, {
      name,
      description,
    })
    return response.data
  }

  async deleteSpriteCategory(id: number): Promise<void> {
    await this.client.delete(`/sprite-categories/${id}`)
  }

  async updateSprite(
    id: number,
    updates: {
      name?: string
      spriteType?: number
      categoryId?: number | null
    }
  ): Promise<{
    id: number
    name: string
    spriteType: number
    categoryId: number | null
  }> {
    const response = await this.client.put(`/sprites/${id}`, updates)
    return response.data
  }
}

export default new ApiClient()
