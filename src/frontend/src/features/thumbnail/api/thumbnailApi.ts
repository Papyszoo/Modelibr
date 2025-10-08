import ApiClient, { ThumbnailStatus } from '../../../services/ApiClient'

/**
 * Thumbnail API wrapper
 * Provides thumbnail-specific API operations
 */
export const thumbnailApi = {
  /**
   * Get thumbnail status for a model
   */
  async getThumbnailStatus(modelId: string): Promise<ThumbnailStatus> {
    return await ApiClient.getThumbnailStatus(modelId)
  },

  /**
   * Get thumbnail URL for a model
   */
  getThumbnailUrl(modelId: string): string {
    return ApiClient.getThumbnailUrl(modelId)
  },

  /**
   * Get thumbnail file blob for a model
   */
  async getThumbnailFile(modelId: string): Promise<Blob> {
    return await ApiClient.getThumbnailFile(modelId)
  },

  /**
   * Regenerate thumbnail for a model
   */
  async regenerateThumbnail(modelId: string): Promise<void> {
    return await ApiClient.regenerateThumbnail(modelId)
  },
}
