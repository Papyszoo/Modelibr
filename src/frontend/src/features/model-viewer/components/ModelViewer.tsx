import { useState, useEffect, useRef, JSX } from 'react'
import { Canvas } from '@react-three/fiber'
import { Stats } from '@react-three/drei'
import ModelPreviewScene from './ModelPreviewScene'
import ModelInfoWindow from './ModelInfoWindow'
import ThumbnailWindow from './ThumbnailWindow'
import ModelHierarchyWindow from './ModelHierarchyWindow'
import ViewerSettingsWindow from './ViewerSettingsWindow'
import UVMapWindow from './UVMapWindow'
import TextureSetSelectorWindow from './TextureSetSelectorWindow'
import ModelVersionWindow from './ModelVersionWindow'
import VersionStrip from './VersionStrip'
import { FileUploadModal } from './FileUploadModal'
import { ViewerSettingsType } from './ViewerSettings'
import { ModelProvider } from '../../../contexts/ModelContext'
import { Model } from '../../../utils/fileUtils'
import { TextureSetDto, ModelVersionDto } from '../../../types'
// eslint-disable-next-line no-restricted-imports -- ModelViewer needs direct API access for fetching model data
import ApiClient from '../../../services/ApiClient'
import { Button } from 'primereact/button'
import { Toast } from 'primereact/toast'
import thumbnailSignalRService, { ThumbnailStatusChangedEvent } from '../../../services/ThumbnailSignalRService'
import './ModelViewer.css'

interface ModelViewerProps {
  model?: Model
  modelId?: string
  side?: 'left' | 'right'
}

function ModelViewer({
  model: propModel,
  modelId,
  side = 'left',
}: ModelViewerProps): JSX.Element {
  const [error, setError] = useState<string>('')
  const [model, setModel] = useState<Model | null>(propModel || null)
  const [loading, setLoading] = useState<boolean>(!propModel && !!modelId)
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
  const [selectedTextureSet, setSelectedTextureSet] =
    useState<TextureSetDto | null>(null)
  const [hasUserSelectedTexture, setHasUserSelectedTexture] = useState(false)
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
  const [versions, setVersions] = useState<ModelVersionDto[]>([])
  const [selectedVersion, setSelectedVersion] =
    useState<ModelVersionDto | null>(null)
  const [versionModel, setVersionModel] = useState<Model | null>(null)
  const [defaultFileId, setDefaultFileId] = useState<number | null>(null)
  const toast = useRef<Toast>(null)
  const statsContainerRef = useRef<HTMLDivElement>(null)

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
    if (!propModel && modelId) {
      fetchModel(modelId, false) // Use cache for initial load
    }
  }, [propModel, modelId])

  // Load versions when model is loaded
  useEffect(() => {
    if (model?.id) {
      loadVersions()
    }
  }, [model?.id])

  const loadVersions = async () => {
    if (!model?.id) return
    try {
      const data = await ApiClient.getModelVersions(parseInt(model.id))
      setVersions(data)

      // Auto-select the active version if no version is currently selected
      if (data.length > 0 && !selectedVersion) {
        const activeVersion =
          data.find(v => v.id === model.activeVersionId) ||
          data[data.length - 1]
        handleVersionSelect(activeVersion)
      } else if (selectedVersion) {
        // If a version is already selected, refresh its data from the new versions list
        const updatedVersion = data.find(v => v.id === selectedVersion.id)
        if (updatedVersion) {
          handleVersionSelect(updatedVersion)
        } else {
          // Selected version no longer exists (was recycled), select the active version
          const activeVersion =
            data.find(v => v.id === model.activeVersionId) ||
            data[data.length - 1]
          if (activeVersion) {
            handleVersionSelect(activeVersion)
          }
        }
      }
    } catch (error) {
      console.error('Failed to load versions:', error)
    }
  }

  // Subscribe to thumbnail status changes to refresh versions when thumbnails are ready
  useEffect(() => {
    if (!model?.id || versions.length === 0) return

    const handleThumbnailStatusChanged = (event: ThumbnailStatusChangedEvent) => {
      // Only reload if the thumbnail is for a version of this model
      const isThisModelsVersion = versions.some(v => v.id === event.modelVersionId)
      
      if (event.status === 'Ready' && isThisModelsVersion) {
        loadVersions()
      }
    }

    const unsubscribe = thumbnailSignalRService.onThumbnailStatusChanged(handleThumbnailStatusChanged)

    return () => {
      // Cleanup: unsubscribe when component unmounts or model changes
      unsubscribe()
    }
  }, [model?.id, versions])

  // Set initial selected texture set to default if available
  // Only auto-select if user hasn't made a manual selection yet
  // Apply version's default texture set when version changes
  useEffect(() => {
    if (selectedVersion?.defaultTextureSetId) {
      setSelectedTextureSetId(selectedVersion.defaultTextureSetId)
      setHasUserSelectedTexture(false) // Reset so future version changes can apply their defaults
    } else if (selectedVersion && !selectedVersion.defaultTextureSetId) {
      // Version has no default, clear selection
      setSelectedTextureSetId(null)
      setHasUserSelectedTexture(false)
    }
  }, [selectedVersion?.id, selectedVersion?.defaultTextureSetId])

  // Load selected texture set data
  useEffect(() => {
    if (selectedTextureSetId) {
      loadTextureSet(selectedTextureSetId)
    } else {
      setSelectedTextureSet(null)
    }
  }, [selectedTextureSetId])

  const fetchModel = async (
    id: string,
    skipCache: boolean = true
  ): Promise<void> => {
    try {
      setLoading(true)
      setError('')
      const model = await ApiClient.getModelById(id, { skipCache })
      setModel(model)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load model')
    } finally {
      setLoading(false)
    }
  }

  const loadTextureSet = async (textureSetId: number): Promise<void> => {
    try {
      const textureSet = await ApiClient.getTextureSetById(textureSetId)
      setSelectedTextureSet(textureSet)
    } catch (err) {
      console.error('Failed to load texture set:', err)
      setSelectedTextureSet(null)
    }
  }

  const handleModelUpdated = async () => {
    if (modelId) {
      await fetchModel(modelId, true) // Skip cache to get fresh data
      await loadVersions() // Also reload versions to update UI
    }
  }

  const handleRegenerateThumbnail = async () => {
    if (!model) return

    try {
      await ApiClient.regenerateThumbnail(model.id.toString())
      toast.current?.show({
        severity: 'success',
        summary: 'Thumbnail Regeneration',
        detail: `Thumbnail regeneration queued for model #${model.id}`,
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
    setHasUserSelectedTexture(true)
  }

  const handleVersionSelect = (version: ModelVersionDto) => {
    setSelectedVersion(version)
    
    // Apply version's default texture set immediately
    if (version.defaultTextureSetId) {
      setSelectedTextureSetId(version.defaultTextureSetId)
      setHasUserSelectedTexture(false)
    } else {
      // Version has no default, clear selection
      setSelectedTextureSetId(null)
      setHasUserSelectedTexture(false)
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
    // If this file is in the current model or version, trigger a re-render
    if (model) {
      setModel({ ...model })
    }
    if (versionModel) {
      setVersionModel({ ...versionModel })
    }
  }

  const handleSetActiveVersion = async (versionId: number) => {
    if (!model) return
    try {
      await ApiClient.setActiveVersion(parseInt(model.id), versionId)
      // Reload versions to update badges
      await loadVersions()
      // Notify parent to refresh model data so UI updates immediately
      if (modelId) {
        await fetchModel(modelId, true) // Skip cache to get fresh data
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
      await ApiClient.softDeleteModelVersion(parseInt(model.id), versionId)
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Model version recycled successfully',
        life: 3000,
      })
      // Refresh model data in case active version changed
      if (modelId) {
        await fetchModel(modelId, true) // Skip cache to get fresh data
      }
      // Reload versions to update list - loadVersions will handle selecting appropriate version
      await loadVersions()
    } catch (error) {
      console.error('Failed to recycle version:', error)
      const errorMessage = error instanceof Error && error.message.includes('last remaining version')
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
        await ApiClient.createModelVersion(
          parseInt(model.id),
          file,
          description,
          setAsActive ?? true
        )
      } else {
        // Add to current/selected version
        // If no versions are loaded yet, reload them first to check if version 1 exists
        if (versions.length === 0) {
          await loadVersions()
          // After loading, check again
          const currentVersions = await ApiClient.getModelVersions(
            parseInt(model.id)
          )

          if (currentVersions.length > 0) {
            // Version 1 exists (auto-created), add file to it
            const latestVersion = currentVersions[currentVersions.length - 1]
            await ApiClient.addFileToVersion(
              parseInt(model.id),
              latestVersion.id,
              file
            )
          } else {
            // No versions exist at all, create first version
            await ApiClient.createModelVersion(
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
          await ApiClient.addFileToVersion(
            parseInt(model.id),
            currentVersion.id,
            file
          )
        }
      }

      toast.current?.show({
        severity: 'success',
        summary: 'Upload Successful',
        detail: `File "${file.name}" uploaded successfully`,
        life: 3000,
      })

      // Reload versions and model
      await loadVersions()
      if (modelId) {
        await fetchModel(modelId)
      }
      handleModelUpdated()
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
        <div className="viewer-container">
          {/* Model name overlay */}
          <div className="viewer-model-name-overlay">
            <span>{model.name}</span>
          </div>
          {/* Floating action buttons for sidebar controls */}
          <div className={`viewer-controls viewer-controls-${buttonPosition}`}>
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
              <button onClick={() => setError('')} className="retry-button">
                Retry
              </button>
            </div>
          ) : (
            <>
              <Canvas
                key={`canvas-${model.id}-${side}-${selectedVersion?.id || 'original'}-${defaultFileId || 'auto'}`}
                shadows
                className="viewer-canvas"
                gl={{
                  antialias: true,
                  alpha: true,
                  powerPreference: 'high-performance',
                }}
                dpr={Math.min(window.devicePixelRatio, 2)}
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

export default ModelViewer
