import { useState, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import Scene from './components/Scene'
import ModelInfo from './components/ModelInfo'
import ThumbnailDisplay from './components/ThumbnailDisplay'
import { getModelFileFormat, Model } from './utils/fileUtils'
import ApiClient from './services/ApiClient'
import './ModelViewer.css'

interface ModelViewerProps {
  model?: Model
  modelId?: string
  onBack?: () => void
  isTabContent?: boolean
}

function ModelViewer({ model: propModel, modelId, onBack, isTabContent = false }: ModelViewerProps): JSX.Element {
  const [error, setError] = useState<string>('')
  const [model, setModel] = useState<Model | null>(propModel || null)
  const [loading, setLoading] = useState<boolean>(!propModel && !!modelId)

  useEffect(() => {
    if (!propModel && modelId) {
      fetchModel(modelId)
    }
  }, [propModel, modelId])

  const fetchModel = async (id: string): Promise<void> => {
    try {
      setLoading(true)
      setError('')
      const models = await ApiClient.getModels()
      const foundModel = models.find(m => m.id === id)
      if (foundModel) {
        setModel(foundModel)
      } else {
        setError('Model not found')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load model')
    } finally {
      setLoading(false)
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
    <div className={`model-viewer ${isTabContent ? 'model-viewer-tab' : ''}`}>
      {!isTabContent && (
        <header className="viewer-header">
          <button onClick={onBack} className="back-button">
            ← Back to Models
          </button>
          <h1>3D Model Viewer</h1>
          <div className="model-details">
            <span className="model-id">Model #{model.id}</span>
            <span className="model-format">
              {getModelFileFormat(model)}
            </span>
          </div>
        </header>
      )}

      {isTabContent && (
        <header className="viewer-header-tab">
          <h1>Model #{model.id}</h1>
          <div className="model-info-summary">
            <span className="model-format">
              {getModelFileFormat(model)}
            </span>
            <span className="model-name">
              {model.files?.[0]?.originalFileName || `Model ${model.id}`}
            </span>
          </div>
        </header>
      )}

      <div className="viewer-container">
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
              powerPreference: "high-performance"
            }}
            dpr={Math.min(window.devicePixelRatio, 2)}
          >
            <Scene model={model} />
          </Canvas>
        )}
      </div>

      <div className="viewer-info">
        <div className="viewer-info-left">
          <ModelInfo model={model} />
        </div>
        <div className="viewer-info-right">
          <div className="thumbnail-section">
            <h3>Animated Thumbnail</h3>
            <ThumbnailDisplay 
              modelId={model.id}
              size="large"
              showAnimation={true}
              showControls={true}
              alt={`Animated thumbnail for ${model.files?.[0]?.originalFileName || `model ${model.id}`}`}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default ModelViewer