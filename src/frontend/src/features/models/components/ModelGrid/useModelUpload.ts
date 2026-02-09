import { useCallback, RefObject } from 'react'
import ApiClient from '../../../../services/ApiClient'
import {
  useFileUpload,
  useDragAndDrop,
} from '../../../../shared/hooks/useFileUpload'
import { Toast } from 'primereact/toast'

interface UseModelUploadOptions {
  packId?: number
  projectId?: number
  toast: RefObject<Toast | null>
  onUploadComplete: () => void
}

export function useModelUpload({
  packId,
  projectId,
  toast,
  onUploadComplete,
}: UseModelUploadOptions) {
  const associateModel = useCallback(
    async (modelId: number) => {
      if (packId) {
        await ApiClient.addModelToPack(packId, modelId)
      }
      if (projectId) {
        await ApiClient.addModelToProject(projectId, modelId)
      }
    },
    [packId, projectId]
  )

  const { uploading, uploadProgress, uploadMultipleFiles } = useFileUpload({
    requireThreeJSRenderable: true,
    toast,
    onSuccess: async (
      _file: unknown,
      results: { succeeded: { result: { id: number } }[] }
    ) => {
      // Associate each uploaded model with the pack/project if applicable
      if (packId || projectId) {
        for (const { result } of results.succeeded) {
          try {
            await associateModel(result.id)
          } catch (err) {
            console.error('Failed to associate model:', err)
          }
        }
      }
      onUploadComplete()
    },
  })

  const { onDrop, onDragOver, onDragEnter, onDragLeave } =
    useDragAndDrop(uploadMultipleFiles)

  return {
    uploading,
    uploadProgress,
    uploadMultipleFiles,
    onDrop,
    onDragOver,
    onDragEnter,
    onDragLeave,
  }
}
