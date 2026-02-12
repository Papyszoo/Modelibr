import { useState, useCallback } from 'react'
import {
  addTextureToSetEndpoint as addTextureToSetEndpointApi,
  associateTextureSetWithAllModelVersions as associateTextureSetWithAllModelVersionsApi,
  associateTextureSetWithModelVersion as associateTextureSetWithModelVersionApi,
  changeTextureChannel as changeTextureChannelApi,
  changeTextureType as changeTextureTypeApi,
  createTextureSet as createTextureSetApi,
  deleteTextureSet as deleteTextureSetApi,
  disassociateTextureSetFromModelVersion as disassociateTextureSetFromModelVersionApi,
  getAllTextureSets as getAllTextureSetsApi,
  getTextureSetById as getTextureSetByIdApi,
  removeTextureFromSet as removeTextureFromSetApi,
  updateTextureSet as updateTextureSetApi,
} from '@/features/texture-set/api/textureSetApi'
import { getModels as getModelsApi } from '@/features/models/api/modelApi'
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
      return await getAllTextureSetsApi()
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
    async (
      id: number,
      options: { skipCache?: boolean } = {}
    ): Promise<TextureSetDto> => {
      try {
        setLoading(true)
        setError(null)
        return await getTextureSetByIdApi(id, options)
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
        return await createTextureSetApi(request)
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
        return await updateTextureSetApi(id, request)
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
      await deleteTextureSetApi(id)
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
        return await addTextureToSetEndpointApi(setId, request)
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
        await removeTextureFromSetApi(setId, textureId)
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
        await changeTextureTypeApi(setId, textureId, newTextureType)
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
        await changeTextureChannelApi(setId, textureId, sourceChannel)
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to change texture channel'
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
        await associateTextureSetWithModelVersionApi(setId, modelVersionId)
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
        await disassociateTextureSetFromModelVersionApi(setId, modelVersionId)
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
        await associateTextureSetWithAllModelVersionsApi(setId, modelId)
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
      return await getModelsApi()
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
