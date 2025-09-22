import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import Scene from './components/Scene'
import ModelInfo from './components/ModelInfo'
import ThumbnailDisplay from './components/ThumbnailDisplay'
import { getModelFileFormat } from './utils/fileUtils'
import './ModelViewer.css'

function ModelViewer({ model, onBack }) {
  const [error, setError] = useState('')

  return (
    <div className="model-viewer">
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