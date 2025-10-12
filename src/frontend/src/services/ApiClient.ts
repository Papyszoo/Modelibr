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
} from '../types'

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

  async uploadModel(file: File): Promise<UploadModelResponse> {
    const formData = new FormData()
    formData.append('file', file)

    const response: AxiosResponse<UploadModelResponse> = await this.client.post(
      '/models',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    )

    return response.data
  }

  async uploadFile(
    file: File
  ): Promise<{ fileId: number; alreadyExists: boolean }> {
    const formData = new FormData()
    formData.append('file', file)

    const response: AxiosResponse<{ fileId: number; alreadyExists: boolean }> =
      await this.client.post('/files', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

    return response.data
  }

  async getModels(): Promise<Model[]> {
    const response: AxiosResponse<Model[]> = await this.client.get('/models')
    return response.data
  }

  async getModelById(modelId: string): Promise<Model> {
    const response: AxiosResponse<Model> = await this.client.get(
      `/models/${modelId}`
    )
    return response.data
  }

  getModelFileUrl(modelId: string): string {
    return `${this.baseURL}/models/${modelId}/file`
  }

  getFileUrl(fileId: string): string {
    return `${this.baseURL}/files/${fileId}`
  }

  // Thumbnail methods
  async getThumbnailStatus(modelId: string): Promise<ThumbnailStatus> {
    const response: AxiosResponse<ThumbnailStatus> = await this.client.get(
      `/models/${modelId}/thumbnail`
    )
    return response.data
  }

  getThumbnailUrl(modelId: string): string {
    return `${this.baseURL}/models/${modelId}/thumbnail/file`
  }

  async getThumbnailFile(modelId: string): Promise<Blob> {
    const response: AxiosResponse<Blob> = await this.client.get(
      `/models/${modelId}/thumbnail/file`,
      { responseType: 'blob' }
    )
    return response.data
  }

  async regenerateThumbnail(modelId: string): Promise<void> {
    const response: AxiosResponse<void> = await this.client.post(
      `/models/${modelId}/thumbnail/regenerate`
    )
    return response.data
  }

  // TextureSet methods
  async getAllTextureSets(): Promise<TextureSetDto[]> {
    const response: AxiosResponse<GetAllTextureSetsResponse> =
      await this.client.get('/texture-sets')
    return response.data.textureSets
  }

  async getTextureSetById(id: number): Promise<TextureSetDto> {
    const response: AxiosResponse<TextureSetDto> = await this.client.get(
      `/texture-sets/${id}`
    )
    return response.data
  }

  async createTextureSet(
    request: CreateTextureSetRequest
  ): Promise<CreateTextureSetResponse> {
    const response: AxiosResponse<CreateTextureSetResponse> =
      await this.client.post('/texture-sets', request)
    return response.data
  }

  async updateTextureSet(
    id: number,
    request: UpdateTextureSetRequest
  ): Promise<UpdateTextureSetResponse> {
    const response: AxiosResponse<UpdateTextureSetResponse> =
      await this.client.put(`/texture-sets/${id}`, request)
    return response.data
  }

  async deleteTextureSet(id: number): Promise<void> {
    await this.client.delete(`/texture-sets/${id}`)
  }

  async addTextureToSetEndpoint(
    setId: number,
    request: AddTextureToSetRequest
  ): Promise<AddTextureToSetResponse> {
    const response: AxiosResponse<AddTextureToSetResponse> =
      await this.client.post(`/texture-sets/${setId}/textures`, request)
    return response.data
  }

  async removeTextureFromSet(setId: number, textureId: number): Promise<void> {
    await this.client.delete(`/texture-sets/${setId}/textures/${textureId}`)
  }

  async associateTextureSetWithModel(
    setId: number,
    modelId: number
  ): Promise<void> {
    await this.client.post(`/texture-sets/${setId}/models/${modelId}`)
  }

  async disassociateTextureSetFromModel(
    setId: number,
    modelId: number
  ): Promise<void> {
    await this.client.delete(`/texture-sets/${setId}/models/${modelId}`)
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
    // Backend returns { stages: [...] } with lowercase from JSON serialization
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
}

export default new ApiClient()
