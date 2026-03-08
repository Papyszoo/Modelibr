import { useRef } from 'react'

import { createSoundWithFile } from '@/features/sounds/api/soundApi'
import { useUploadProgress } from '@/hooks/useUploadProgress'
import { useDragAndDrop } from '@/shared/hooks/useFileUpload'
import { decodeAudio, extractPeaks } from '@/utils/audioUtils'

const UNASSIGNED_CATEGORY_ID = -1

interface ShowToast {
  (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }): void
}

interface UseSoundUploadOptions {
  showToast: ShowToast
  activeCategoryId: number | null
  loadSounds: () => Promise<void>
}

export function useSoundUpload({
  showToast,
  activeCategoryId,
  loadSounds,
}: UseSoundUploadOptions) {
  const uploadProgressContext = useUploadProgress()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileDrop = async (files: File[] | FileList) => {
    const fileArray = Array.from(files)

    const audioFiles = fileArray.filter(
      file =>
        file.type.startsWith('audio/') ||
        /\.(mp3|wav|ogg|flac|aac|m4a)$/i.test(file.name)
    )

    if (audioFiles.length === 0) {
      showToast({
        severity: 'warn',
        summary: 'Invalid Files',
        detail: 'Please drop audio files only',
        life: 3000,
      })
      return
    }

    const batchId = uploadProgressContext?.createBatch() || undefined
    const categoryIdToAssign =
      activeCategoryId === UNASSIGNED_CATEGORY_ID
        ? undefined
        : (activeCategoryId ?? undefined)

    for (const file of audioFiles) {
      let uploadId: string | null = null
      try {
        uploadId =
          uploadProgressContext?.addUpload(file, 'sound', batchId) || null

        if (uploadId && uploadProgressContext) {
          uploadProgressContext.updateUploadProgress(uploadId, 20)
        }

        // Decode audio to extract duration and peaks
        let duration = 0
        let peaks: string | undefined
        try {
          const audioBuffer = await decodeAudio(file)
          duration = audioBuffer.duration
          try {
            const peakData = extractPeaks(audioBuffer, 200)
            peaks = JSON.stringify(peakData)
          } catch (peakError) {
            console.warn('Could not extract peaks:', peakError)
          }
        } catch (decodeError) {
          console.warn(
            'Could not decode audio for peaks, using defaults:',
            decodeError
          )
        }

        if (uploadId && uploadProgressContext) {
          uploadProgressContext.updateUploadProgress(uploadId, 50)
        }

        const fileName = file.name.replace(/\.[^/.]+$/, '')
        const result = await createSoundWithFile(file, {
          name: fileName,
          duration,
          peaks,
          categoryId: categoryIdToAssign,
          batchId,
        })

        if (uploadId && uploadProgressContext) {
          uploadProgressContext.updateUploadProgress(uploadId, 100)
          uploadProgressContext.completeUpload(uploadId, {
            fileId: result.fileId,
            soundId: result.soundId,
          })
        }

        showToast({
          severity: 'success',
          summary: 'Success',
          detail: `Sound "${fileName}" created successfully`,
          life: 3000,
        })
      } catch (error) {
        if (uploadId && uploadProgressContext) {
          uploadProgressContext.failUpload(uploadId, error as Error)
        }

        console.error('Failed to create sound from file:', error)
        showToast({
          severity: 'error',
          summary: 'Error',
          detail: `Failed to create sound from ${file.name}`,
          life: 3000,
        })
      }
    }

    loadSounds()
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
