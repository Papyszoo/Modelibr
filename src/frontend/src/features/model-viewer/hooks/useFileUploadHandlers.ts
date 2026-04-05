import { useCallback, useRef, useState } from 'react'

import {
  addFileToVersion,
  createModelVersion,
} from '@/features/model-viewer/api/modelVersionApi'
import { useBlenderEnabledStore } from '@/stores/blenderEnabledStore'
import { type ModelVersionDto } from '@/types'
import { type Model } from '@/utils/fileUtils'

export interface FileUploadState {
  dragOver: boolean
  uploadModalVisible: boolean
  droppedFile: File | null
  fileInputRef: React.RefObject<HTMLInputElement | null>
  handleDragOver: (e: React.DragEvent) => void
  handleDragLeave: (e: React.DragEvent) => void
  handleDrop: (e: React.DragEvent) => void
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleUploadClick: () => void
  handleFileUpload: (
    file: File,
    action: 'current' | 'new',
    description?: string,
    targetVersionNumber?: number,
    setAsActive?: boolean
  ) => Promise<void>
  hideUploadModal: () => void
}

interface FileUploadDeps {
  model: Model | null
  versions: ModelVersionDto[]
  selectedVersion: ModelVersionDto | null
  onSuccess: () => Promise<void>
  showToast: (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }) => void
  refetchVersions: () => Promise<unknown>
}

/**
 * Encapsulates all drag-and-drop / file upload logic for the ModelViewer.
 */
export function useFileUploadHandlers(deps: FileUploadDeps): FileUploadState {
  const {
    model,
    versions,
    selectedVersion,
    onSuccess,
    showToast,
    refetchVersions,
  } = deps
  const [dragOver, setDragOver] = useState(false)
  const [uploadModalVisible, setUploadModalVisible] = useState(false)
  const [droppedFile, setDroppedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const blenderEnabled = useBlenderEnabledStore(s => s.blenderEnabled)

  const rejectDisabledBlendUpload = useCallback(
    (file: File) => {
      if (file.name.toLowerCase().endsWith('.blend') && !blenderEnabled) {
        showToast({
          severity: 'warn',
          summary: 'Blender Required',
          detail:
            'Install Blender from Settings before uploading .blend files.',
          life: 5000,
        })
        return true
      }

      return false
    },
    [blenderEnabled, showToast]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragOver(false)

      const files = e.dataTransfer.files
      if (files && files.length > 0) {
        if (rejectDisabledBlendUpload(files[0])) {
          return
        }
        setDroppedFile(files[0])
        setUploadModalVisible(true)
      }
    },
    [rejectDisabledBlendUpload]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        if (rejectDisabledBlendUpload(e.target.files[0])) {
          e.target.value = ''
          return
        }
        setDroppedFile(e.target.files[0])
        setUploadModalVisible(true)
        e.target.value = ''
      }
    },
    [rejectDisabledBlendUpload]
  )

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const hideUploadModal = useCallback(() => {
    setUploadModalVisible(false)
    setDroppedFile(null)
  }, [])

  const handleFileUpload = useCallback(
    async (
      file: File,
      action: 'current' | 'new',
      description?: string,
      _targetVersionNumber?: number,
      setAsActive?: boolean
    ) => {
      if (!model) return

      if (rejectDisabledBlendUpload(file)) {
        throw new Error(
          'Install Blender from Settings before uploading .blend files.'
        )
      }

      try {
        if (action === 'new') {
          await createModelVersion(
            parseInt(model.id),
            file,
            description,
            setAsActive ?? true
          )
        } else {
          if (versions.length === 0) {
            const refreshedVersions = await refetchVersions()
            const currentVersions =
              (refreshedVersions as { data?: ModelVersionDto[] })?.data ?? []

            if (currentVersions.length > 0) {
              const latestVersion = currentVersions[currentVersions.length - 1]
              await addFileToVersion(parseInt(model.id), latestVersion.id, file)
            } else {
              await createModelVersion(
                parseInt(model.id),
                file,
                description,
                setAsActive ?? true
              )
            }
          } else {
            const currentVersion =
              selectedVersion || versions[versions.length - 1]
            await addFileToVersion(parseInt(model.id), currentVersion.id, file)
          }
        }

        showToast({
          severity: 'success',
          summary: 'Upload Successful',
          detail: `File "${file.name}" uploaded successfully`,
          life: 3000,
        })

        await onSuccess()
      } catch (error) {
        showToast({
          severity: 'error',
          summary: 'Upload Failed',
          detail: error instanceof Error ? error.message : 'Unknown error',
          life: 5000,
        })
        throw error
      }
    },
    [
      model,
      versions,
      selectedVersion,
      onSuccess,
      showToast,
      refetchVersions,
      rejectDisabledBlendUpload,
    ]
  )

  return {
    dragOver,
    uploadModalVisible,
    droppedFile,
    fileInputRef,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileSelect,
    handleUploadClick,
    handleFileUpload,
    hideUploadModal,
  }
}
