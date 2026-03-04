import { type Toast } from 'primereact/toast'
import { type RefObject, useCallback } from 'react'

import { addModelToPack } from '@/features/pack/api/packApi'
import { addModelToProject } from '@/features/project/api/projectApi'
import { useDragAndDrop, useFileUpload } from '@/shared/hooks/useFileUpload'
import { useBlenderEnabledStore } from '@/stores/blenderEnabledStore'

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
  const blenderEnabled = useBlenderEnabledStore(s => s.blenderEnabled)

  const associateModel = useCallback(
    async (modelId: number) => {
      if (packId) {
        await addModelToPack(packId, modelId)
      }
      if (projectId) {
        await addModelToProject(projectId, modelId)
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

  // Wrap uploadMultipleFiles to filter out .blend when blenderEnabled is false
  const filteredUploadMultipleFiles = useCallback(
    (files: File[] | FileList) => {
      const fileArray = Array.from(files)
      const filtered = blenderEnabled
        ? fileArray
        : fileArray.filter(f => !f.name.toLowerCase().endsWith('.blend'))
      if (filtered.length === 0) return
      return uploadMultipleFiles(filtered)
    },
    [blenderEnabled, uploadMultipleFiles]
  )

  const { onDrop, onDragOver, onDragEnter, onDragLeave } = useDragAndDrop(
    filteredUploadMultipleFiles
  )

  return {
    uploading,
    uploadProgress,
    uploadMultipleFiles: filteredUploadMultipleFiles,
    onDrop,
    onDragOver,
    onDragEnter,
    onDragLeave,
  }
}
