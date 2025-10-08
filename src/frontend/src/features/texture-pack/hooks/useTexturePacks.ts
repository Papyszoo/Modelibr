import { useState, useCallback } from 'react'
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
} from '../../../types'

export function useTexturePacks() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getAllTexturePacks = useCallback(async (): Promise<
    TexturePackDto[]
  > => {
    try {
      setLoading(true)
      setError(null)
      return await ApiClient.getAllTexturePacks()
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load texture packs'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const getTexturePackById = useCallback(
    async (id: number): Promise<TexturePackDto> => {
      try {
        setLoading(true)
        setError(null)
        return await ApiClient.getTexturePackById(id)
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to load texture pack'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const createTexturePack = useCallback(
    async (
      request: CreateTexturePackRequest
    ): Promise<CreateTexturePackResponse> => {
      try {
        setLoading(true)
        setError(null)
        return await ApiClient.createTexturePack(request)
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to create texture pack'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const updateTexturePack = useCallback(
    async (
      id: number,
      request: UpdateTexturePackRequest
    ): Promise<UpdateTexturePackResponse> => {
      try {
        setLoading(true)
        setError(null)
        return await ApiClient.updateTexturePack(id, request)
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to update texture pack'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const deleteTexturePack = useCallback(async (id: number): Promise<void> => {
    try {
      setLoading(true)
      setError(null)
      await ApiClient.deleteTexturePack(id)
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete texture pack'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const addTextureToPackEndpoint = useCallback(
    async (
      packId: number,
      request: AddTextureToPackRequest
    ): Promise<AddTextureToPackResponse> => {
      try {
        setLoading(true)
        setError(null)
        return await ApiClient.addTextureToPack(packId, request)
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to add texture to pack'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const removeTextureFromPack = useCallback(
    async (packId: number, textureId: number): Promise<void> => {
      try {
        setLoading(true)
        setError(null)
        await ApiClient.removeTextureFromPack(packId, textureId)
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to remove texture from pack'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const associateTexturePackWithModel = useCallback(
    async (packId: number, modelId: number): Promise<void> => {
      try {
        setLoading(true)
        setError(null)
        await ApiClient.associateWithModel(packId, modelId)
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to associate texture pack with model'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const disassociateTexturePackFromModel = useCallback(
    async (packId: number, modelId: number): Promise<void> => {
      try {
        setLoading(true)
        setError(null)
        await ApiClient.disassociateFromModel(packId, modelId)
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to disassociate texture pack from model'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const getModels = useCallback(async (): Promise<Model[]> => {
    try {
      setLoading(true)
      setError(null)
      return await ApiClient.getModels()
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load models'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    loading,
    error,
    getAllTexturePacks,
    getTexturePackById,
    createTexturePack,
    updateTexturePack,
    deleteTexturePack,
    addTextureToPackEndpoint,
    removeTextureFromPack,
    associateTexturePackWithModel,
    disassociateTexturePackFromModel,
    getModels,
  }
}
