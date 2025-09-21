import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import Scene from './components/Scene'
import ModelInfo from './components/ModelInfo'
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
        <ModelInfo model={model} />
      </div>
    </div>
  )
}

export default ModelViewer