import ApiClient from '../../../services/ApiClient'
import {
  TexturePackDto,
  CreateTexturePackRequest,
  CreateTexturePackResponse,
  UpdateTexturePackRequest,
  UpdateTexturePackResponse,
  AddTextureToPackRequest,
  AddTextureToPackResponse,
  Model,
} from '../../../../types'

/**
 * Texture Packs API wrapper
 * Provides texture pack-specific API operations
 */
export const texturePacksApi = {
  /**
   * Get all texture packs
   */
  async getAllTexturePacks(): Promise<TexturePackDto[]> {
    return await ApiClient.getAllTexturePacks()
  },

  /**
   * Get a texture pack by ID
   */
  async getTexturePackById(id: number): Promise<TexturePackDto> {
    return await ApiClient.getTexturePackById(id)
  },

  /**
   * Create a new texture pack
   */
  async createTexturePack(
    request: CreateTexturePackRequest
  ): Promise<CreateTexturePackResponse> {
    return await ApiClient.createTexturePack(request)
  },

  /**
   * Update a texture pack
   */
  async updateTexturePack(
    id: number,
    request: UpdateTexturePackRequest
  ): Promise<UpdateTexturePackResponse> {
    return await ApiClient.updateTexturePack(id, request)
  },

  /**
   * Delete a texture pack
   */
  async deleteTexturePack(id: number): Promise<void> {
    return await ApiClient.deleteTexturePack(id)
  },

  /**
   * Add a texture to a pack
   */
  async addTextureToPack(
    packId: number,
    request: AddTextureToPackRequest
  ): Promise<AddTextureToPackResponse> {
    return await ApiClient.addTextureToPackEndpoint(packId, request)
  },

  /**
   * Remove a texture from a pack
   */
  async removeTextureFromPack(
    packId: number,
    textureId: number
  ): Promise<void> {
    return await ApiClient.removeTextureFromPack(packId, textureId)
  },

  /**
   * Associate a texture pack with a model
   */
  async associateWithModel(packId: number, modelId: number): Promise<void> {
    return await ApiClient.associateTexturePackWithModel(packId, modelId)
  },

  /**
   * Disassociate a texture pack from a model
   */
  async disassociateFromModel(packId: number, modelId: number): Promise<void> {
    return await ApiClient.disassociateTexturePackFromModel(packId, modelId)
  },

  /**
   * Get all models (used in dialogs)
   */
  async getModels(): Promise<Model[]> {
    return await ApiClient.getModels()
  },
}
