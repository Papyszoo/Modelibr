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
import { FileUploadModal } from './FileUploadModal'
import { ViewerSettingsType } from './ViewerSettings'
import { ModelProvider } from '../../../contexts/ModelContext'
import { getModelFileFormat, Model } from '../../../utils/fileUtils'
import { TextureSetDto, ModelVersionDto } from '../../../types'
// eslint-disable-next-line no-restricted-imports -- ModelViewer needs direct API access for fetching model data
import ApiClient from '../../../services/ApiClient'
import { Button } from 'primereact/button'
import { Toast } from 'primereact/toast'
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
  const toast = useRef<Toast>(null)
  const statsContainerRef = useRef<HTMLDivElement>(null)

  // Determine which side for button positioning
  const buttonPosition = side === 'left' ? 'right' : 'left'

  useEffect(() => {
    if (!propModel && modelId) {
      fetchModel(modelId)
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
    } catch (error) {
      console.error('Failed to load versions:', error)
    }
  }

  // Set initial selected texture set to default if available
  // Only auto-select if user hasn't made a manual selection yet
  useEffect(() => {
    if (
      model?.defaultTextureSetId &&
      selectedTextureSetId === null &&
      !hasUserSelectedTexture
    ) {
      setSelectedTextureSetId(model.defaultTextureSetId)
    }
  }, [model?.defaultTextureSetId, selectedTextureSetId, hasUserSelectedTexture])

  // Load selected texture set data
  useEffect(() => {
    if (selectedTextureSetId) {
      loadTextureSet(selectedTextureSetId)
    } else {
      setSelectedTextureSet(null)
    }
  }, [selectedTextureSetId])

  const fetchModel = async (id: string): Promise<void> => {
    try {
      setLoading(true)
      setError('')
      const model = await ApiClient.getModelById(id)
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

  const handleModelUpdated = () => {
    if (modelId) {
      fetchModel(modelId)
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
    targetVersionNumber?: number
  ) => {
    if (!model) return

    try {
      if (action === 'new' || versions.length === 0) {
        // Create new version
        await ApiClient.createModelVersion(parseInt(model.id), file, description)
      } else {
        // Add to current version - for now we'll create a new version
        // In a real implementation, you'd need a backend endpoint to add file to existing version
        await ApiClient.createModelVersion(
          parseInt(model.id),
          file,
          description || 'Added file to existing version'
        )
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

      <header className="viewer-header-tab">
        <h1>Model #{model.id}</h1>
        <div className="model-info-summary">
          <span className="model-format">{getModelFileFormat(model)}</span>
          <span className="model-name">
            {model.files?.[0]?.originalFileName || `Model ${model.id}`}
          </span>
        </div>
      </header>

      <ModelProvider>
        <div className="viewer-container">
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
                key={`canvas-${model.id}-${side}`}
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
                  key={`scene-${model.id}-${side}-${selectedTextureSetId || 'none'}`}
                  model={model}
                  settings={viewerSettings}
                  textureSet={selectedTextureSet}
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
        onUpload={handleFileUpload}
      />
    </div>
  )
}

export default ModelViewer
