import axios, { AxiosInstance, AxiosResponse } from 'axios'
import { Model } from '../utils/fileUtils'
import {
  TexturePackDto,
  GetAllTexturePacksResponse,
  GetTexturePackByIdResponse,
  CreateTexturePackRequest,
  CreateTexturePackResponse,
  UpdateTexturePackRequest,
  UpdateTexturePackResponse,
  AddTextureToPackRequest,
  AddTextureToPackResponse,
} from '../types'

export interface UploadModelResponse {
  id: number
  alreadyExists: boolean
}

export interface ThumbnailStatus {
  Status: 'Pending' | 'Processing' | 'Ready' | 'Failed'
  FileUrl?: string
  SizeBytes?: number
  Width?: number
  Height?: number
  ErrorMessage?: string
  CreatedAt?: string
  ProcessedAt?: string
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

  async regenerateThumbnail(modelId: string): Promise<void> {
    const response: AxiosResponse<void> = await this.client.post(
      `/models/${modelId}/thumbnail/regenerate`
    )
    return response.data
  }

  // TexturePack methods
  async getAllTexturePacks(): Promise<TexturePackDto[]> {
    const response: AxiosResponse<GetAllTexturePacksResponse> =
      await this.client.get('/texture-packs')
    return response.data.texturePacks
  }

  async getTexturePackById(id: number): Promise<TexturePackDto> {
    const response: AxiosResponse<GetTexturePackByIdResponse> =
      await this.client.get(`/texture-packs/${id}`)
    return response.data.texturePack
  }

  async createTexturePack(
    request: CreateTexturePackRequest
  ): Promise<CreateTexturePackResponse> {
    const response: AxiosResponse<CreateTexturePackResponse> =
      await this.client.post('/texture-packs', request)
    return response.data
  }

  async updateTexturePack(
    id: number,
    request: UpdateTexturePackRequest
  ): Promise<UpdateTexturePackResponse> {
    const response: AxiosResponse<UpdateTexturePackResponse> =
      await this.client.put(`/texture-packs/${id}`, request)
    return response.data
  }

  async deleteTexturePack(id: number): Promise<void> {
    await this.client.delete(`/texture-packs/${id}`)
  }

  async addTextureToPackEndpoint(
    packId: number,
    request: AddTextureToPackRequest
  ): Promise<AddTextureToPackResponse> {
    const response: AxiosResponse<AddTextureToPackResponse> =
      await this.client.post(`/texture-packs/${packId}/textures`, request)
    return response.data
  }

  async removeTextureFromPack(
    packId: number,
    textureId: number
  ): Promise<void> {
    await this.client.delete(`/texture-packs/${packId}/textures/${textureId}`)
  }

  async associateTexturePackWithModel(
    packId: number,
    modelId: number
  ): Promise<void> {
    await this.client.post(`/texture-packs/${packId}/models/${modelId}`)
  }

  async disassociateTexturePackFromModel(
    packId: number,
    modelId: number
  ): Promise<void> {
    await this.client.delete(`/texture-packs/${packId}/models/${modelId}`)
  }
}

export default new ApiClient()
