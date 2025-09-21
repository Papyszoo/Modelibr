import { useState, useEffect } from 'react'
import './ModelList.css'
import ModelViewer from './ModelViewer'

function ModelList({ onBackToUpload }) {
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchModels()
  }, [])

  const fetchModels = async () => {
    try {
      setLoading(true)
      // Use port 5009 for direct API access during development
      const response = await fetch('http://localhost:5009/models')
      
      if (response.ok) {
        const result = await response.json()
        setModels(result.value?.models || [])
      } else {
        setError(`Failed to fetch models: ${response.statusText}`)
      }
    } catch (err) {
      setError(`Error fetching models: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleModelSelect = (model) => {
    setSelectedModel(model)
  }

  const handleBackToList = () => {
    setSelectedModel(null)
  }

  if (selectedModel) {
    return (
      <ModelViewer 
        model={selectedModel} 
        onBack={handleBackToList}
      />
    )
  }

  return (
    <div className="model-list">
      <header className="model-list-header">
        <div className="header-controls">
          <button onClick={onBackToUpload} className="back-to-upload-button">
            ← Back to Upload
          </button>
        </div>
        <h1>3D Model Library</h1>
        <p>Select a model to view in 3D</p>
      </header>

      {loading && (
        <div className="loading">Loading models...</div>
      )}

      {error && (
        <div className="error-message">
          {error}
          <button onClick={fetchModels} className="retry-button">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && models.length === 0 && (
        <div className="empty-state">
          <h3>No models found</h3>
          <p>Upload some 3D models to get started!</p>
        </div>
      )}

      {!loading && !error && models.length > 0 && (
        <div className="models-grid">
          {models.map((model) => (
            <div 
              key={model.id} 
              className="model-card"
              onClick={() => handleModelSelect(model)}
            >
              <div className="model-preview">
                <div className="model-icon">📦</div>
                <div className="model-format">
                  {getFileExtension(model.filePath).toUpperCase()}
                </div>
              </div>
              <div className="model-info">
                <h3>Model #{model.id}</h3>
                <p className="model-filename">
                  {getFileName(model.filePath)}
                </p>
                <p className="model-date">
                  Created: {new Date(model.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function getFileExtension(filePath) {
  return filePath.split('.').pop() || 'unknown'
}

function getFileName(filePath) {
  const parts = filePath.split('/')
  return parts[parts.length - 1] || 'unknown'
}

export default ModelList