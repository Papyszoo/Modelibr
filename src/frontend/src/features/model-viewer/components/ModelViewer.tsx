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
import { ViewerSettingsType } from './ViewerSettings'
import { ModelProvider } from '../../../contexts/ModelContext'
import { getModelFileFormat, Model } from '../../../utils/fileUtils'
import { TextureSetDto } from '../../../types'
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
  const toast = useRef<Toast>(null)
  const statsContainerRef = useRef<HTMLDivElement>(null)

  // Determine which side for button positioning
  const buttonPosition = side === 'left' ? 'right' : 'left'

  useEffect(() => {
    if (!propModel && modelId) {
      fetchModel(modelId)
    }
  }, [propModel, modelId])

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
    <div className="model-viewer model-viewer-tab">
      <Toast ref={toast} />

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
    </div>
  )
}

export default ModelViewer
