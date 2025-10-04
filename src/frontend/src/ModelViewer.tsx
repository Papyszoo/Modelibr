import { useState, useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import Scene from './components/Scene'
import ModelInfoSidebar from './components/ModelInfoSidebar'
import ThumbnailSidebar from './components/ThumbnailSidebar'
import { getModelFileFormat, Model } from './utils/fileUtils'
import ApiClient from './services/ApiClient'
import { Button } from 'primereact/button'
import { Toast } from 'primereact/toast'
import { Sidebar } from 'primereact/sidebar'
import './ModelViewer.css'

type SidebarContentType = 'info' | 'thumbnail'

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
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(false)
  const [sidebarContent, setSidebarContent] =
    useState<SidebarContentType>('info')
  const toast = useRef<Toast>(null)

  // Determine which side for sidebar positioning
  const sidebarPosition = side ?? 'left'
  const buttonPosition = side === 'left' ? 'right' : 'left'

  useEffect(() => {
    if (!propModel && modelId) {
      fetchModel(modelId)
    }
  }, [propModel, modelId])

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

  const openSidebar = (content: SidebarContentType) => {
    setSidebarContent(content)
    setSidebarVisible(true)
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

      <div className="viewer-container">
        {/* Floating action buttons for sidebar controls */}
        <div className={`viewer-controls viewer-controls-${buttonPosition}`}>
          <Button
            icon="pi pi-info-circle"
            className="p-button-rounded viewer-control-btn"
            onClick={() => openSidebar('info')}
            tooltip="Model Information"
            tooltipOptions={{
              position: buttonPosition === 'left' ? 'right' : 'left',
            }}
          />
          <Button
            icon="pi pi-image"
            className="p-button-rounded viewer-control-btn"
            onClick={() => openSidebar('thumbnail')}
            tooltip="Thumbnail Details"
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
          <Canvas
            camera={{ position: [3, 3, 3], fov: 60 }}
            shadows
            className="viewer-canvas"
            gl={{
              antialias: true,
              alpha: true,
              powerPreference: 'high-performance',
            }}
            dpr={Math.min(window.devicePixelRatio, 2)}
          >
            <Scene model={model} />
          </Canvas>
        )}
      </div>

      {/* Sidebar */}
      <Sidebar
        visible={sidebarVisible}
        position={sidebarPosition}
        onHide={() => setSidebarVisible(false)}
        className="model-viewer-sidebar"
        style={{ width: '400px' }}
      >
        {sidebarContent === 'info' && <ModelInfoSidebar model={model} />}
        {sidebarContent === 'thumbnail' && (
          <ThumbnailSidebar
            model={model}
            onRegenerate={handleRegenerateThumbnail}
          />
        )}
      </Sidebar>
    </div>
  )
}

export default ModelViewer
