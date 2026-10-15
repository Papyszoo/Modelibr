import { type Toast } from 'primereact/toast'
import { createElement, type RefObject, useCallback } from 'react'

import { addModelToPack } from '@/features/pack/api/packApi'
import { addModelToProject } from '@/features/project/api/projectApi'
import { useDragAndDrop, useFileUpload } from '@/shared/hooks/useFileUpload'
import { useBlenderEnabledStore } from '@/stores/blenderEnabledStore'

interface UseModelUploadOptions {
  packId?: number
  projectId?: number
  toast: RefObject<Toast | null>
  onUploadComplete: () => void
  /** Opens the asset an upload deduped to, so "already exists" links to it. */
  onOpenModel?: (modelId: number) => void
}

export function useModelUpload({
  packId,
  projectId,
  toast,
  onUploadComplete,
  onOpenModel,
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

  const {
    uploading,
    uploadProgress,
    uploadMultipleFiles,
    uploadFolder,
    uploadZip,
  } = useFileUpload({
    requireThreeJSRenderable: true,
    toast,
    // Every multi-model path (multi-file, folder, zip) reports this shape.
    onSuccess: async (
      _file: unknown,
      results: {
        succeeded: {
          file?: { name?: string }
          result: { id: number; alreadyExists?: boolean }
        }[]
      }
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

      // A file the backend deduped to an existing asset is not a new import.
      // Say so and offer an "Open" action; do NOT steal focus by opening the
      // asset's tab automatically.
      const duplicates = results.succeeded.filter(
        ({ result }) => result.alreadyExists
      )
      if (duplicates.length > 0) {
        const firstName = duplicates[0].file?.name
        const firstId = duplicates[0].result.id
        const detail =
          duplicates.length === 1
            ? `${firstName ?? 'This file'} already exists.`
            : `${duplicates.length} files already exist.`
        toast.current?.show({
          severity: 'info',
          summary: 'Already in your library',
          detail,
          life: 5000,
          content: () =>
            createElement(
              'div',
              { className: 'model-upload-toast' },
              createElement('i', {
                className: 'pi pi-info-circle',
                'aria-hidden': true,
              }),
              createElement(
                'span',
                null,
                createElement('strong', null, 'Already in your library'),
                ` - ${detail}`
              ),
              createElement(
                'button',
                {
                  type: 'button',
                  className: 'p-button p-button-text p-button-sm',
                  'data-testid': 'duplicate-upload-open',
                  onClick: () => onOpenModel?.(firstId),
                },
                'Open'
              )
            ),
        })
      }

      onUploadComplete()
    },
  })

  // Folder and zip imports run through the same gates as the file picker:
  // renderable-only (the hook's requireThreeJSRenderable) plus the .blend allowance
  // below. Without this they were side doors for .blend/.dae/.3ds files the grid
  // otherwise refuses - a zip especially, since it used to be unzipped server-side
  // where no client gate applied at all.
  const gatedUploadFolder = useCallback(
    (files: File[] | FileList) =>
      uploadFolder(files, { allowBlend: blenderEnabled }),
    [blenderEnabled, uploadFolder]
  )

  const gatedUploadZip = useCallback(
    (file: File) => uploadZip(file, { allowBlend: blenderEnabled }),
    [blenderEnabled, uploadZip]
  )

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
    // Multi-file glTF import (folder / .zip) - a zip is expanded in the browser and
    // then follows the folder path exactly.
    uploadFolder: gatedUploadFolder,
    uploadZip: gatedUploadZip,
    onDrop,
    onDragOver,
    onDragEnter,
    onDragLeave,
  }
}
