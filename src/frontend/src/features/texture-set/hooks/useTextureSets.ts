import { useState, useCallback } from 'react'
import ApiClient from '../../../services/ApiClient'
import {
  TextureSetDto,
  CreateTextureSetRequest,
  CreateTextureSetResponse,
  UpdateTextureSetRequest,
  UpdateTextureSetResponse,
  AddTextureToSetRequest,
  AddTextureToSetResponse,
  Model,
} from '../../../types'

export function useTextureSets() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getAllTextureSets = useCallback(async (): Promise<
    TextureSetDto[]
  > => {
    try {
      setLoading(true)
      setError(null)
      return await ApiClient.getAllTextureSets()
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load texture sets'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const getTextureSetById = useCallback(
    async (id: number): Promise<TextureSetDto> => {
      try {
        setLoading(true)
        setError(null)
        return await ApiClient.getTextureSetById(id)
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to load texture set'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const createTextureSet = useCallback(
    async (
      request: CreateTextureSetRequest
    ): Promise<CreateTextureSetResponse> => {
      try {
        setLoading(true)
        setError(null)
        return await ApiClient.createTextureSet(request)
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to create texture set'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const updateTextureSet = useCallback(
    async (
      id: number,
      request: UpdateTextureSetRequest
    ): Promise<UpdateTextureSetResponse> => {
      try {
        setLoading(true)
        setError(null)
        return await ApiClient.updateTextureSet(id, request)
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to update texture set'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const deleteTextureSet = useCallback(async (id: number): Promise<void> => {
    try {
      setLoading(true)
      setError(null)
      await ApiClient.deleteTextureSet(id)
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete texture set'
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const addTextureToSetEndpoint = useCallback(
    async (
      setId: number,
      request: AddTextureToSetRequest
    ): Promise<AddTextureToSetResponse> => {
      try {
        setLoading(true)
        setError(null)
        return await ApiClient.addTextureToSetEndpoint(setId, request)
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to add texture to set'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const removeTextureFromSet = useCallback(
    async (setId: number, textureId: number): Promise<void> => {
      try {
        setLoading(true)
        setError(null)
        await ApiClient.removeTextureFromSet(setId, textureId)
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to remove texture from set'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const associateTextureSetWithModel = useCallback(
    async (setId: number, modelId: number): Promise<void> => {
      try {
        setLoading(true)
        setError(null)
        await ApiClient.associateTextureSetWithModel(setId, modelId)
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to associate texture set with model'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const disassociateTextureSetFromModel = useCallback(
    async (setId: number, modelId: number): Promise<void> => {
      try {
        setLoading(true)
        setError(null)
        await ApiClient.disassociateTextureSetFromModel(setId, modelId)
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to disassociate texture set from model'
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
    getAllTextureSets,
    getTextureSetById,
    createTextureSet,
    updateTextureSet,
    deleteTextureSet,
    addTextureToSetEndpoint,
    removeTextureFromSet,
    associateTextureSetWithModel,
    disassociateTextureSetFromModel,
    getModels,
  }
}
