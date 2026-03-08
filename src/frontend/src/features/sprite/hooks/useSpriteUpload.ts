import { type RefObject } from 'react'

import { createSpriteWithFile } from '@/features/sprite/api/spriteApi'
import { useUploadProgress } from '@/hooks/useUploadProgress'

const UNASSIGNED_CATEGORY_ID = -1
const SPRITE_TYPE_STATIC = 1
const SPRITE_TYPE_GIF = 3

interface UseSpriteUploadOptions {
  activeCategoryId: number | null
  uploadProgressContext: ReturnType<typeof useUploadProgress> | null
  invalidateSprites: () => Promise<void>
  toast: RefObject<{
    show: (opts: {
      severity: string
      summary: string
      detail: string
      life: number
    }) => void
  } | null>
}

export function useSpriteUpload({
  activeCategoryId,
  uploadProgressContext,
  invalidateSprites,
  toast,
}: UseSpriteUploadOptions) {
  const handleFileDrop = async (files: File[] | FileList) => {
    const fileArray = Array.from(files)

    const imageFiles = fileArray.filter(
      file =>
        file.type.startsWith('image/') ||
        /\.(png|jpg|jpeg|gif|webp|apng|bmp|svg)$/i.test(file.name)
    )

    if (imageFiles.length === 0) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Invalid Files',
        detail: 'Please drop image files only',
        life: 3000,
      })
      return
    }

    const batchId = uploadProgressContext?.createBatch() || undefined
    const categoryIdToAssign =
      activeCategoryId === UNASSIGNED_CATEGORY_ID
        ? undefined
        : (activeCategoryId ?? undefined)

    for (const file of imageFiles) {
      let uploadId: string | null = null
      try {
        uploadId =
          uploadProgressContext?.addUpload(file, 'sprite', batchId) || null

        if (uploadId && uploadProgressContext) {
          uploadProgressContext.updateUploadProgress(uploadId, 50)
        }

        const fileName = file.name.replace(/\.[^/.]+$/, '')
        const result = await createSpriteWithFile(file, {
          name: fileName,
          spriteType:
            file.type === 'image/gif' ? SPRITE_TYPE_GIF : SPRITE_TYPE_STATIC,
          categoryId: categoryIdToAssign,
          batchId,
        })

        if (uploadId && uploadProgressContext) {
          uploadProgressContext.updateUploadProgress(uploadId, 100)
          uploadProgressContext.completeUpload(uploadId, {
            fileId: result.fileId,
            spriteId: result.spriteId,
          })
        }

        toast.current?.show({
          severity: 'success',
          summary: 'Success',
          detail: `Sprite "${fileName}" created successfully`,
          life: 3000,
        })
      } catch (error) {
        if (uploadId && uploadProgressContext) {
          uploadProgressContext.failUpload(uploadId, error as Error)
        }

        console.error('Failed to create sprite from file:', error)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: `Failed to create sprite from ${file.name}`,
          life: 3000,
        })
      }
    }

    invalidateSprites()
  }

  return { handleFileDrop }
}
