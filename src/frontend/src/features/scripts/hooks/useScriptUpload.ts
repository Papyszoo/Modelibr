import { useRef } from 'react'

import { createScriptWithFile } from '@/features/scripts/api/scriptApi'
import { useUploadProgress } from '@/hooks/useUploadProgress'
import { useDragAndDrop } from '@/shared/hooks/useFileUpload'

const UNASSIGNED_CATEGORY_ID = -1

// Recognized source-code extensions, mirroring the backend FileType mapping.
const SCRIPT_EXTENSION_RE =
  /\.(js|jsx|mjs|cjs|ts|tsx|py|cs|cpp|cc|cxx|c|h|hpp|lua|java|go|rs|rb|php|sh|sql|json|yaml|yml|xml|glsl|vert|frag|hlsl|shader|gd)$/i

interface ShowToast {
  (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }): void
}

interface UseScriptUploadOptions {
  showToast: ShowToast
  activeCategoryId: number | null
  loadScripts: () => Promise<void>
}

export function useScriptUpload({
  showToast,
  activeCategoryId,
  loadScripts,
}: UseScriptUploadOptions) {
  const uploadProgressContext = useUploadProgress()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileDrop = async (files: File[] | FileList) => {
    const fileArray = Array.from(files)

    const scriptFiles = fileArray.filter(file =>
      SCRIPT_EXTENSION_RE.test(file.name)
    )

    if (scriptFiles.length === 0) {
      showToast({
        severity: 'warn',
        summary: 'Invalid Files',
        detail: 'Please drop source-code files only',
        life: 3000,
      })
      return
    }

    const batchId = uploadProgressContext?.createBatch() || undefined
    const categoryIdToAssign =
      activeCategoryId === UNASSIGNED_CATEGORY_ID
        ? undefined
        : (activeCategoryId ?? undefined)

    for (const file of scriptFiles) {
      let uploadId: string | null = null
      try {
        uploadId =
          uploadProgressContext?.addUpload(file, 'script', batchId) || null

        if (uploadId && uploadProgressContext) {
          uploadProgressContext.updateUploadProgress(uploadId, 50)
        }

        const fileName = file.name.replace(/\.[^/.]+$/, '')
        const result = await createScriptWithFile(file, {
          name: fileName,
          categoryId: categoryIdToAssign,
        })

        if (uploadId && uploadProgressContext) {
          uploadProgressContext.updateUploadProgress(uploadId, 100)
          uploadProgressContext.completeUpload(uploadId, {
            fileId: result.fileId,
            scriptId: result.scriptId,
          })
        }

        showToast({
          severity: 'success',
          summary: 'Success',
          detail: `Script "${fileName}" created successfully`,
          life: 3000,
        })
      } catch (error) {
        if (uploadId && uploadProgressContext) {
          uploadProgressContext.failUpload(uploadId, error as Error)
        }

        console.error('Failed to create script from file:', error)
        showToast({
          severity: 'error',
          summary: 'Error',
          detail: `Failed to create script from ${file.name}`,
          life: 3000,
        })
      }
    }

    loadScripts()
  }

  const { onDrop, onDragOver, onDragEnter, onDragLeave } =
    useDragAndDrop(handleFileDrop)

  return {
    onDrop,
    onDragOver,
    onDragEnter,
    onDragLeave,
    fileInputRef,
    handleFileDrop,
  }
}
