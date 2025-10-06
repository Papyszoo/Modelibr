import { useState } from 'react'
import './ModelGrid.css'
import ThumbnailDisplay from '../ThumbnailDisplay'
import { Model } from '../../utils/fileUtils'

interface ModelGridProps {
  models: Model[]
  onModelSelect: (model: Model) => void
  onDrop: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnter: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
}

export default function ModelGrid({
  models,
  onModelSelect,
  onDrop,
  onDragOver,
  onDragEnter,
  onDragLeave,
}: ModelGridProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const getModelName = (model: Model) => {
    // Get the first file's name or use the model name
    return model.files && model.files.length > 0
      ? model.files[0].originalFileName
      : model.name || `Model ${model.id}`
  }

  const filteredModels = models.filter(model => {
    const modelName = getModelName(model).toLowerCase()
    return modelName.includes(searchQuery.toLowerCase())
  })

  return (
    <div
      className="model-grid-container"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    >
      {/* Search and filter bar */}
      <div className="model-grid-controls">
        <div className="search-bar">
          <i className="pi pi-search" />
          <input
            type="text"
            placeholder="Search models..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-bar">
          <span className="filter-placeholder">Filters (Coming Soon)</span>
        </div>
      </div>

      {/* Grid of model cards */}
      <div className="model-grid">
        {filteredModels.map(model => (
          <div
            key={model.id}
            className="model-card"
            onClick={() => onModelSelect(model)}
          >
            <div className="model-card-thumbnail">
              <ThumbnailDisplay modelId={model.id} />
              <div className="model-card-overlay">
                <span className="model-card-name">{getModelName(model)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredModels.length === 0 && (
        <div className="no-results">
          <i className="pi pi-search" />
          <p>No models found matching "{searchQuery}"</p>
        </div>
      )}
    </div>
  )
}
