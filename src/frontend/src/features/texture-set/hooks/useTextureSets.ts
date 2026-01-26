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

  const getAllTextureSets = useCallback(async (): Promise<TextureSetDto[]> => {
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
    async (id: number, options: { skipCache?: boolean } = {}): Promise<TextureSetDto> => {
      try {
        setLoading(true)
        setError(null)
        return await ApiClient.getTextureSetById(id, options)
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

  const changeTextureType = useCallback(
    async (
      setId: number,
      textureId: number,
      newTextureType: number
    ): Promise<void> => {
      try {
        setLoading(true)
        setError(null)
        await ApiClient.changeTextureType(setId, textureId, newTextureType)
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to change texture type'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const changeTextureChannel = useCallback(
    async (
      setId: number,
      textureId: number,
      sourceChannel: number
    ): Promise<void> => {
      try {
        setLoading(true)
        setError(null)
        await ApiClient.changeTextureChannel(setId, textureId, sourceChannel)
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to change texture channel'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const associateTextureSetWithModelVersion = useCallback(
    async (setId: number, modelVersionId: number): Promise<void> => {
      try {
        setLoading(true)
        setError(null)
        await ApiClient.associateTextureSetWithModelVersion(setId, modelVersionId)
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to associate texture set with model version'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const disassociateTextureSetFromModelVersion = useCallback(
    async (setId: number, modelVersionId: number): Promise<void> => {
      try {
        setLoading(true)
        setError(null)
        await ApiClient.disassociateTextureSetFromModelVersion(setId, modelVersionId)
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to disassociate texture set from model version'
        setError(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const associateTextureSetWithAllModelVersions = useCallback(
    async (setId: number, modelId: number): Promise<void> => {
      try {
        setLoading(true)
        setError(null)
        await ApiClient.associateTextureSetWithAllModelVersions(setId, modelId)
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to associate texture set with all model versions'
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
    changeTextureType,
    changeTextureChannel,
    associateTextureSetWithModelVersion,
    disassociateTextureSetFromModelVersion,
    associateTextureSetWithAllModelVersions,
    getModels,
  }
}
