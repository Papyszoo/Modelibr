import ApiClient, { UploadModelResponse } from '../../../services/ApiClient'
import { Model } from '../../../utils/fileUtils'

/**
 * Models API wrapper
 * Provides model-specific API operations
 */
export const modelsApi = {
  /**
   * Get all models
   */
  async getModels(): Promise<Model[]> {
    return await ApiClient.getModels()
  },

  /**
   * Get a model by ID
   */
  async getModelById(modelId: string): Promise<Model> {
    return await ApiClient.getModelById(modelId)
  },

  /**
   * Get model file URL
   */
  getModelFileUrl(modelId: string): string {
    return ApiClient.getModelFileUrl(modelId)
  },

  /**
   * Get file URL by file ID
   */
  getFileUrl(fileId: string): string {
    return ApiClient.getFileUrl(fileId)
  },

  /**
   * Upload a model file
   */
  async uploadModel(file: File): Promise<UploadModelResponse> {
    return await ApiClient.uploadModel(file)
  },

  /**
   * Upload a file (without creating a model)
   */
  async uploadFile(
    file: File
  ): Promise<{ fileId: number; alreadyExists: boolean }> {
    return await ApiClient.uploadFile(file)
  },
}
