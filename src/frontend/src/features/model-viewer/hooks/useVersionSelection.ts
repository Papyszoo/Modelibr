import { useCallback, useEffect, useState } from 'react'

import { type ModelVersionDto } from '@/types'
import { type Model } from '@/utils/fileUtils'

export interface VersionSelectionState {
  selectedVersion: ModelVersionDto | null
  versionModel: Model | null
  defaultFileId: number | null
  selectedTextureSetId: number | null
  handleVersionSelect: (version: ModelVersionDto) => void
  handleDefaultFileChange: (fileId: number) => void
  handleTextureSetSelect: (textureSetId: number | null) => void
}

/**
 * Manages version selection, file selection, and texture set selection within
 * the ModelViewer. Encapsulates the effects that keep derived state in sync
 * when versions change.
 */
export function useVersionSelection(
  model: Model | null,
  versions: ModelVersionDto[]
): VersionSelectionState {
  const [selectedVersion, setSelectedVersion] =
    useState<ModelVersionDto | null>(null)
  const [versionModel, setVersionModel] = useState<Model | null>(null)
  const [defaultFileId, setDefaultFileId] = useState<number | null>(null)
  const [selectedTextureSetId, setSelectedTextureSetId] = useState<
    number | null
  >(null)

  // Load default file preference from localStorage
  useEffect(() => {
    if (model) {
      const stored = localStorage.getItem(`model-${model.id}-default-file`)
      if (stored) {
        setDefaultFileId(parseInt(stored))
      }
    }
  }, [model])

  const handleVersionSelect = useCallback(
    (version: ModelVersionDto) => {
      setSelectedVersion(version)

      // Apply version's default texture set immediately
      if (version.defaultTextureSetId) {
        setSelectedTextureSetId(version.defaultTextureSetId)
      } else {
        setSelectedTextureSetId(null)
      }

      // Create a temporary model with the version's files for preview
      if (model) {
        const versionModelData: Model = {
          ...model,
          files: version.files.map(f => ({
            id: f.id.toString(),
            originalFileName: f.originalFileName,
            storedFileName: f.originalFileName,
            filePath: '',
            mimeType: f.mimeType,
            sizeBytes: f.sizeBytes,
            sha256Hash: '',
            fileType: f.fileType,
            isRenderable: f.isRenderable,
            createdAt: version.createdAt,
            updatedAt: version.createdAt,
          })),
        }
        setVersionModel(versionModelData)

        // Auto-select first renderable file if current selection is invalid
        const renderableFiles = version.files.filter(f => f.isRenderable)
        if (renderableFiles.length > 0) {
          const currentFileInVersion = version.files.find(
            f => f.id === defaultFileId
          )
          if (!currentFileInVersion || !currentFileInVersion.isRenderable) {
            setDefaultFileId(renderableFiles[0].id)
          }
        }
      }
    },
    [model, defaultFileId]
  )

  // Keep selected version aligned with server versions
  useEffect(() => {
    if (!model) return

    if (versions.length === 0) {
      setSelectedVersion(null)
      setVersionModel(null)
      return
    }

    if (!selectedVersion) {
      const activeVersion =
        versions.find(v => v.id === model.activeVersionId) ||
        versions[versions.length - 1]
      handleVersionSelect(activeVersion)
      return
    }

    const updatedVersion = versions.find(v => v.id === selectedVersion.id)
    if (updatedVersion) {
      handleVersionSelect(updatedVersion)
      return
    }

    const fallbackVersion =
      versions.find(v => v.id === model.activeVersionId) ||
      versions[versions.length - 1]
    if (fallbackVersion) {
      handleVersionSelect(fallbackVersion)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Keep selected version and derived preview model aligned with server versions
  }, [versions, model?.activeVersionId])

  // Apply version's default texture set when version changes
  useEffect(() => {
    if (selectedVersion?.defaultTextureSetId) {
      setSelectedTextureSetId(selectedVersion.defaultTextureSetId)
    } else if (selectedVersion && !selectedVersion.defaultTextureSetId) {
      setSelectedTextureSetId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Effect reacts to selected version identity and default texture fields
  }, [selectedVersion?.id, selectedVersion?.defaultTextureSetId])

  const handleDefaultFileChange = useCallback(
    (fileId: number) => {
      setDefaultFileId(fileId)
      if (model) {
        localStorage.setItem(
          `model-${model.id}-default-file`,
          fileId.toString()
        )
      }
      if (versionModel) {
        setVersionModel({ ...versionModel })
      }
    },
    [model, versionModel]
  )

  const handleTextureSetSelect = useCallback((textureSetId: number | null) => {
    setSelectedTextureSetId(textureSetId)
  }, [])

  return {
    selectedVersion,
    versionModel,
    defaultFileId,
    selectedTextureSetId,
    handleVersionSelect,
    handleDefaultFileChange,
    handleTextureSetSelect,
  }
}
