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

function ModelViewer({
  model: propModel,
  modelId,
  onBack,
  isTabContent = false,
}: ModelViewerProps): JSX.Element {
  const [error, setError] = useState<string>('')
  const [model, setModel] = useState<Model | null>(propModel || null)
  const [loading, setLoading] = useState<boolean>(!propModel && !!modelId)
  const [retryCount, setRetryCount] = useState<number>(0)

  useEffect(() => {
    if (!propModel && modelId) {
      fetchModel(modelId)
    }
  }, [propModel, modelId])

  // Handle page visibility changes - ensure proper rendering when tab becomes visible again
  useEffect(() => {
    const handleVisibilityChange = () => {
      // Only refetch if we actually have an error and no model data
      if (!document.hidden && error && !model && modelId && !loading) {
        console.log('Tab became visible, retrying model fetch...')
        fetchModel(modelId)
      }
      // For successful model loads, @react-three/fiber Canvas will handle proper re-rendering
      // and the Model component already handles centering and scaling automatically
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [error, model, modelId, loading])

  const fetchModel = async (id: string, isRetry: boolean = false): Promise<void> => {
    try {
      setLoading(true)
      if (!isRetry) {
        setError('')
        setRetryCount(0)
      }
      const model = await ApiClient.getModelById(id)
      setModel(model)
      setError('')
      setRetryCount(0)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load model'
      setError(errorMessage)
      
      // Auto-retry up to 3 times for network-related errors
      if (retryCount < 3 && (
        errorMessage.includes('timeout') || 
        errorMessage.includes('Network Error') ||
        errorMessage.includes('Failed to fetch')
      )) {
        const nextRetryCount = retryCount + 1
        setRetryCount(nextRetryCount)
        
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, nextRetryCount - 1) * 1000
        setTimeout(() => {
          fetchModel(id, true)
        }, delay)
      }
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="model-viewer-loading">Loading model...</div>
  }

  if (error && !model) {
    return (
      <div className="model-viewer-error">
        <h3>Failed to load model</h3>
        <p>{error}</p>
        {retryCount > 0 && (
          <p className="retry-info">
            Retrying... (attempt {retryCount}/3)
          </p>
        )}
        <button 
          onClick={() => modelId && fetchModel(modelId)} 
          className="retry-button"
          disabled={loading}
        >
          {loading ? 'Retrying...' : 'Retry'}
        </button>
      </div>
    )
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
            <span className="model-format">{getModelFileFormat(model)}</span>
          </div>
        </header>
      )}

      {isTabContent && (
        <header className="viewer-header-tab">
          <h1>Model #{model.id}</h1>
          <div className="model-info-summary">
            <span className="model-format">{getModelFileFormat(model)}</span>
            <span className="model-name">
              {model.files?.[0]?.originalFileName || `Model ${model.id}`}
            </span>
          </div>
        </header>
      )}

      <div className="viewer-container">
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
