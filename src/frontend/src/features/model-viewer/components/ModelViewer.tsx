import { useState, useEffect, useRef, JSX } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { Stats } from '@react-three/drei'
import { Scene as ModelPreviewScene } from './ModelPreviewScene'
import { ModelInfoWindow } from './ModelInfoWindow'
import { ThumbnailWindow } from './ThumbnailWindow'
import { ModelHierarchyWindow } from './ModelHierarchyWindow'
import { ViewerSettingsWindow } from './ViewerSettingsWindow'
import { UVMapWindow } from './UVMapWindow'
import { TextureSetSelectorWindow } from './TextureSetSelectorWindow'
import { ModelVersionWindow } from './ModelVersionWindow'
import { VersionStrip } from './VersionStrip'
import { FileUploadModal } from './FileUploadModal'
import { ViewerSettingsType } from './ViewerSettings'
import { ModelProvider } from '@/contexts/ModelContext'
import { Model } from '@/utils/fileUtils'
import { TextureSetDto, ModelVersionDto } from '@/types'
import {
  addFileToVersion,
  createModelVersion,
  setActiveVersion,
  softDeleteModelVersion,
} from '@/features/model-viewer/api/modelVersionApi'
import { regenerateThumbnail } from '@/shared/thumbnail/api/thumbnailApi'
import {
  useModelByIdQuery,
  useModelVersionsQuery,
} from '@/features/model-viewer/api/queries'
import { useTextureSetByIdQuery } from '@/features/texture-set/api/queries'
import { Button } from 'primereact/button'
import { Toast } from 'primereact/toast'
import { useModelThumbnailUpdates } from '@/shared/thumbnail'
import './ModelViewer.css'

interface ModelViewerProps {
  model?: Model
  modelId?: string
  side?: 'left' | 'right'
}

export function ModelViewer({
  model: propModel,
  modelId,
  side = 'left',
}: ModelViewerProps): JSX.Element {
  const [infoWindowVisible, setInfoWindowVisible] = useState<boolean>(false)
  const [thumbnailWindowVisible, setThumbnailWindowVisible] =
    useState<boolean>(false)
  const [hierarchyWindowVisible, setHierarchyWindowVisible] =
    useState<boolean>(false)
  const [settingsWindowVisible, setSettingsWindowVisible] =
    useState<boolean>(false)
  const [uvMapWindowVisible, setUvMapWindowVisible] = useState<boolean>(false)
  const [textureSetWindowVisible, setTextureSetWindowVisible] =
    useState<boolean>(false)
  const [versionWindowVisible, setVersionWindowVisible] =
    useState<boolean>(false)
  const [selectedTextureSetId, setSelectedTextureSetId] = useState<
    number | null
  >(null)
  const [viewerSettings, setViewerSettings] = useState<ViewerSettingsType>({
    orbitSpeed: 1,
    zoomSpeed: 1,
    panSpeed: 1,
    modelRotationSpeed: 0.002,
    showShadows: true,
    showStats: false,
  })
  const [dragOver, setDragOver] = useState(false)
  const [uploadModalVisible, setUploadModalVisible] = useState(false)
  const [droppedFile, setDroppedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedVersion, setSelectedVersion] =
    useState<ModelVersionDto | null>(null)
  const [versionModel, setVersionModel] = useState<Model | null>(null)
  const [defaultFileId, setDefaultFileId] = useState<number | null>(null)
  const toast = useRef<Toast>(null)
  const statsContainerRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const modelQuery = useModelByIdQuery({
    modelId: modelId || '',
    queryConfig: {
      enabled: !propModel && !!modelId,
    },
  })
  const model: Model | null = propModel || modelQuery.data || null
  const modelNumericId = model?.id ? parseInt(model.id) : null
  const versionsQuery = useModelVersionsQuery({
    modelId: modelNumericId ?? 0,
    queryConfig: {
      enabled: modelNumericId !== null,
    },
  })
  const versions: ModelVersionDto[] = versionsQuery.data ?? []
  const textureSetQuery = useTextureSetByIdQuery({
    textureSetId: selectedTextureSetId ?? 0,
    queryConfig: {
      enabled: selectedTextureSetId !== null,
    },
  })
  const selectedTextureSet: TextureSetDto | null =
    selectedTextureSetId !== null ? (textureSetQuery.data ?? null) : null
  const loading = !propModel && !!modelId && modelQuery.isLoading
  const error =
    modelQuery.error instanceof Error ? modelQuery.error.message : ''

  // Determine which side for button positioning
  const buttonPosition = side === 'left' ? 'right' : 'left'

  // Load default file preference from localStorage
  useEffect(() => {
    if (model) {
      const stored = localStorage.getItem(`model-${model.id}-default-file`)
      if (stored) {
        setDefaultFileId(parseInt(stored))
      }
    }
  }, [model])

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

  // Subscribe via hook (keeps components from importing services directly)
  useModelThumbnailUpdates(
    model?.id ? parseInt(model.id) : null,
    undefined,
    undefined,
    event => {
      if (versions.length === 0) return
      const isThisModelsVersion = versions.some(
        v => v.id === event.modelVersionId
      )
      if (event.status === 'Ready' && isThisModelsVersion) {
        void versionsQuery.refetch()
      }
    }
  )

  // Set initial selected texture set to default if available
  // Only auto-select if user hasn't made a manual selection yet
  // Apply version's default texture set when version changes
  useEffect(() => {
    if (selectedVersion?.defaultTextureSetId) {
      setSelectedTextureSetId(selectedVersion.defaultTextureSetId)
    } else if (selectedVersion && !selectedVersion.defaultTextureSetId) {
      // Version has no default, clear selection
      setSelectedTextureSetId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Effect reacts to selected version identity and default texture fields
  }, [selectedVersion?.id, selectedVersion?.defaultTextureSetId])

  const handleModelUpdated = async () => {
    if (modelId && !propModel) {
      await modelQuery.refetch()
    }
    await queryClient.invalidateQueries({ queryKey: ['modelVersions'] })
    await versionsQuery.refetch()
  }

  const handleRegenerateThumbnail = async () => {
    if (!model) return

    try {
      await regenerateThumbnail(model.id.toString(), selectedVersion?.id)
      const versionInfo = selectedVersion
        ? ` version #${selectedVersion.id}`
        : ''
      toast.current?.show({
        severity: 'success',
        summary: 'Thumbnail Regeneration',
        detail: `Thumbnail regeneration queued for model #${model.id}${versionInfo}`,
        life: 3000,
      })
    } catch (err) {
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: `Failed to regenerate thumbnail: ${err instanceof Error ? err.message : 'Unknown error'}`,
        life: 5000,
      })
    }
  }

  const handleTextureSetSelect = (textureSetId: number | null) => {
    setSelectedTextureSetId(textureSetId)
  }

  const handleVersionSelect = (version: ModelVersionDto) => {
    setSelectedVersion(version)

    // Apply version's default texture set immediately
    if (version.defaultTextureSetId) {
      setSelectedTextureSetId(version.defaultTextureSetId)
    } else {
      // Version has no default, clear selection
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

      // Auto-select first renderable file if no file is currently selected
      // or if the currently selected file is not in this version
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
  }

  const handleDefaultFileChange = (fileId: number) => {
    setDefaultFileId(fileId)
    // Save preference to localStorage
    if (model) {
      localStorage.setItem(`model-${model.id}-default-file`, fileId.toString())
    }
    if (versionModel) {
      setVersionModel({ ...versionModel })
    }
  }

  const handleSetActiveVersion = async (versionId: number) => {
    if (!model) return
    try {
      await setActiveVersion(parseInt(model.id), versionId)
      await versionsQuery.refetch()
      if (modelId && !propModel) {
        await modelQuery.refetch()
      }
    } catch (error) {
      console.error('Failed to set active version:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to set active version',
        life: 3000,
      })
    }
  }

  const handleRecycleVersion = async (versionId: number) => {
    if (!model) return
    try {
      await softDeleteModelVersion(parseInt(model.id), versionId)
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Model version recycled successfully',
        life: 3000,
      })
      if (modelId && !propModel) {
        await modelQuery.refetch()
      }
      await versionsQuery.refetch()
    } catch (error) {
      console.error('Failed to recycle version:', error)
      const errorMessage =
        error instanceof Error &&
        error.message.includes('last remaining version')
          ? 'Cannot delete the last version. A model must have at least one version.'
          : 'Failed to recycle model version'
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: errorMessage,
        life: 3000,
      })
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      const file = files[0]
      setDroppedFile(file)
      setUploadModalVisible(true)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setDroppedFile(e.target.files[0])
      setUploadModalVisible(true)
      // Reset input
      e.target.value = ''
    }
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileUpload = async (
    file: File,
    action: 'current' | 'new',
    description?: string,
    targetVersionNumber?: number,
    setAsActive?: boolean
  ) => {
    if (!model) return

    try {
      if (action === 'new') {
        // Always create new version when explicitly requested
        await createModelVersion(
          parseInt(model.id),
          file,
          description,
          setAsActive ?? true
        )
      } else {
        // Add to current/selected version
        // If no versions are loaded yet, reload them first to check if version 1 exists
        if (versions.length === 0) {
          const refreshedVersions = await versionsQuery.refetch()
          const currentVersions = refreshedVersions.data ?? []

          if (currentVersions.length > 0) {
            // Version 1 exists (auto-created), add file to it
            const latestVersion = currentVersions[currentVersions.length - 1]
            await addFileToVersion(parseInt(model.id), latestVersion.id, file)
          } else {
            // No versions exist at all, create first version
            await createModelVersion(
              parseInt(model.id),
              file,
              description,
              setAsActive ?? true
            )
          }
        } else {
          // Versions are already loaded, use selected or latest
          const currentVersion =
            selectedVersion || versions[versions.length - 1]
          await addFileToVersion(parseInt(model.id), currentVersion.id, file)
        }
      }

      toast.current?.show({
        severity: 'success',
        summary: 'Upload Successful',
        detail: `File "${file.name}" uploaded successfully`,
        life: 3000,
      })

      // Reload versions and model
      await versionsQuery.refetch()
      if (modelId && !propModel) {
        await modelQuery.refetch()
      }
      await handleModelUpdated()
    } catch (error) {
      toast.current?.show({
        severity: 'error',
        summary: 'Upload Failed',
        detail: error instanceof Error ? error.message : 'Unknown error',
        life: 5000,
      })
      throw error
    }
  }

  if (loading) {
    return <div className="model-viewer-loading">Loading model...</div>
  }

  if (error) {
    return <div className="model-viewer-error">Error: {error}</div>
  }

  if (!model) {
    return <div className="model-viewer-error">No model data available</div>
  }

  return (
    <div
      className="model-viewer model-viewer-tab"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Toast ref={toast} />

      {dragOver && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(59, 130, 246, 0.1)',
            border: '3px dashed #3b82f6',
            borderRadius: '8px',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              background: '#3b82f6',
              color: 'white',
              padding: '2rem 3rem',
              borderRadius: '8px',
              fontSize: '1.5rem',
              fontWeight: 'bold',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            }}
          >
            Drop file to upload
          </div>
        </div>
      )}

      <header className="viewer-header-tab viewer-header-compact">
        <VersionStrip
          model={model}
          versions={versions}
          selectedVersion={selectedVersion}
          onVersionSelect={handleVersionSelect}
          onSetActiveVersion={handleSetActiveVersion}
          onRecycleVersion={handleRecycleVersion}
          defaultFileId={defaultFileId}
          onDefaultFileChange={handleDefaultFileChange}
        />
      </header>

      <ModelProvider>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileSelect}
          accept=".obj,.fbx,.gltf,.glb"
        />
        <div className="viewer-container">
          {/* Model name overlay */}
          <div className="viewer-model-name-overlay">
            <span>{model.name}</span>
          </div>
          {/* Floating action buttons for sidebar controls */}
          <div className={`viewer-controls viewer-controls-${buttonPosition}`}>
            <Button
              icon="pi pi-plus"
              className="p-button-rounded viewer-control-btn"
              onClick={handleUploadClick}
              tooltip="Add Version"
              tooltipOptions={{
                position: buttonPosition === 'left' ? 'right' : 'left',
              }}
              aria-label="Add Version"
            />
            <Button
              icon="pi pi-cog"
              className="p-button-rounded viewer-control-btn"
              onClick={() => setSettingsWindowVisible(!settingsWindowVisible)}
              tooltip="Viewer Settings"
              tooltipOptions={{
                position: buttonPosition === 'left' ? 'right' : 'left',
              }}
            />
            <Button
              icon="pi pi-info-circle"
              className="p-button-rounded viewer-control-btn"
              onClick={() => setInfoWindowVisible(!infoWindowVisible)}
              tooltip="Model Information"
              tooltipOptions={{
                position: buttonPosition === 'left' ? 'right' : 'left',
              }}
            />
            <Button
              icon="pi pi-palette"
              className="p-button-rounded viewer-control-btn"
              onClick={() =>
                setTextureSetWindowVisible(!textureSetWindowVisible)
              }
              tooltip="Texture Sets"
              tooltipOptions={{
                position: buttonPosition === 'left' ? 'right' : 'left',
              }}
            />
            {/* Model Versions button removed - versions now in header strip */}
            <Button
              icon="pi pi-sitemap"
              className="p-button-rounded viewer-control-btn"
              onClick={() => setHierarchyWindowVisible(!hierarchyWindowVisible)}
              tooltip="Model Hierarchy"
              tooltipOptions={{
                position: buttonPosition === 'left' ? 'right' : 'left',
              }}
            />
            <Button
              icon="pi pi-image"
              className="p-button-rounded viewer-control-btn"
              onClick={() => setThumbnailWindowVisible(!thumbnailWindowVisible)}
              tooltip="Thumbnail Details"
              tooltipOptions={{
                position: buttonPosition === 'left' ? 'right' : 'left',
              }}
            />
            <Button
              icon="pi pi-map"
              className="p-button-rounded viewer-control-btn"
              onClick={() => setUvMapWindowVisible(!uvMapWindowVisible)}
              tooltip="UV Map"
              tooltipOptions={{
                position: buttonPosition === 'left' ? 'right' : 'left',
              }}
            />
            <Button
              icon="pi pi-box"
              className="p-button-rounded viewer-control-btn"
              onClick={() => {
                if (model?.id) {
                  const versionParam = selectedVersion?.id
                    ? `&versionId=${selectedVersion.id}`
                    : ''
                  window.location.href = `modelibr://open?modelId=${model.id}${versionParam}`
                }
              }}
              tooltip="Open in Blender"
              tooltipOptions={{
                position: buttonPosition === 'left' ? 'right' : 'left',
              }}
            />
          </div>

          {error ? (
            <div className="viewer-error">
              <h3>Failed to load model</h3>
              <p>{error}</p>
              <button
                onClick={() => void modelQuery.refetch()}
                className="retry-button"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              <Canvas
                key={`canvas-${model.id}-${side}-${selectedVersion?.id || 'original'}-${defaultFileId || 'auto'}`}
                shadows
                className="viewer-canvas"
                data-testid="model-viewer-canvas"
                gl={{
                  antialias: true,
                  alpha: true,
                  powerPreference: 'high-performance',
                }}
                dpr={Math.min(window.devicePixelRatio, 2)}
                onCreated={state => {
                  // Expose Three.js scene for E2E testing
                  // This allows Playwright to verify actual 3D content is rendered
                  if (typeof window !== 'undefined') {
                    ;(
                      window as Window & {
                        __THREE_SCENE__?: THREE.Scene
                        __THREE_STATE__?: typeof state
                      }
                    ).__THREE_SCENE__ = state.scene
                    ;(
                      window as Window & {
                        __THREE_SCENE__?: THREE.Scene
                        __THREE_STATE__?: typeof state
                      }
                    ).__THREE_STATE__ = state
                  }
                }}
              >
                <ModelPreviewScene
                  key={`scene-${model.id}-${side}-${selectedTextureSetId || 'none'}-${selectedVersion?.id || 'original'}-${defaultFileId || 'auto'}`}
                  model={versionModel || model}
                  settings={viewerSettings}
                  textureSet={selectedTextureSet}
                  defaultFileId={defaultFileId}
                />
              </Canvas>
              {/* Stats container positioned in bottom-left corner of viewer */}
              <div ref={statsContainerRef} className="stats-container" />
              {viewerSettings.showStats && statsContainerRef.current && (
                <Stats showPanel={0} parent={statsContainerRef} />
              )}
            </>
          )}
        </div>

        {/* Floating Windows */}
        <ViewerSettingsWindow
          visible={settingsWindowVisible}
          onClose={() => setSettingsWindowVisible(false)}
          side={side}
          settings={viewerSettings}
          onSettingsChange={setViewerSettings}
        />
        <ModelInfoWindow
          visible={infoWindowVisible}
          onClose={() => setInfoWindowVisible(false)}
          side={side}
          model={model}
          onModelUpdated={handleModelUpdated}
        />
        <TextureSetSelectorWindow
          visible={textureSetWindowVisible}
          onClose={() => setTextureSetWindowVisible(false)}
          side={side}
          model={model}
          modelVersionId={selectedVersion?.id || model.activeVersionId || null}
          selectedVersion={selectedVersion}
          selectedTextureSetId={selectedTextureSetId}
          onTextureSetSelect={handleTextureSetSelect}
          onModelUpdated={handleModelUpdated}
        />
        <ThumbnailWindow
          visible={thumbnailWindowVisible}
          onClose={() => setThumbnailWindowVisible(false)}
          side={side}
          model={model}
          selectedVersion={selectedVersion}
          onRegenerate={handleRegenerateThumbnail}
        />
        <ModelHierarchyWindow
          visible={hierarchyWindowVisible}
          onClose={() => setHierarchyWindowVisible(false)}
          side={side}
        />
        <UVMapWindow
          visible={uvMapWindowVisible}
          onClose={() => setUvMapWindowVisible(false)}
          side={side}
          model={model}
        />
        <ModelVersionWindow
          visible={versionWindowVisible}
          onClose={() => setVersionWindowVisible(false)}
          side={side}
          model={model}
          onVersionSelect={handleVersionSelect}
          onDefaultFileChange={handleDefaultFileChange}
          onModelUpdate={handleModelUpdated}
          onRecycleVersion={handleRecycleVersion}
        />
      </ModelProvider>

      {/* File Upload Modal */}
      <FileUploadModal
        visible={uploadModalVisible}
        onHide={() => {
          setUploadModalVisible(false)
          setDroppedFile(null)
        }}
        file={droppedFile}
        modelId={model?.id ? parseInt(model.id) : 0}
        versions={versions}
        selectedVersion={selectedVersion}
        onUpload={handleFileUpload}
      />
    </div>
  )
}
