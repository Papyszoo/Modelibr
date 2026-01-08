import { useState } from 'react'
import { ProgressBar } from 'primereact/progressbar'
import { Button } from 'primereact/button'
import CardWidthSlider from '../../../shared/components/CardWidthSlider'
import { useCardWidthStore } from '../../../stores/cardWidthStore'
import './StageGrid.css'

interface StageDto {
  id: number
  name: string
  createdAt: string
  updatedAt: string
}

interface StageGridProps {
  stages: StageDto[]
  loading?: boolean
  onStageSelect: (stage: StageDto) => void
  onStageDelete: (stage: StageDto) => void
}

function StageGrid({
  stages,
  loading = false,
  onStageSelect,
  onStageDelete,
}: StageGridProps) {
  const [searchQuery, setSearchQuery] = useState('')
  
  const { settings, setCardWidth } = useCardWidthStore()
  const cardWidth = settings.stages

  const filteredStages = stages.filter(stage => {
    const name = stage.name.toLowerCase()
    return name.includes(searchQuery.toLowerCase())
  })

  // Loading state
  if (loading) {
    return (
      <div className="stage-grid-loading">
        <ProgressBar mode="indeterminate" style={{ height: '6px' }} />
        <p>Loading stages...</p>
      </div>
    )
  }

  // Empty state
  if (stages.length === 0) {
    return (
      <div className="stage-grid-empty">
        <i className="pi pi-sun" />
        <h3>No Stages</h3>
        <p>Create a stage to start building visual environments</p>
        <p className="hint">
          Stages define lighting, effects, and scene composition
        </p>
      </div>
    )
  }

  return (
    <div className="stage-grid-container">
      {/* Search bar */}
      <div className="stage-grid-controls">
        <div className="search-bar">
          <i className="pi pi-search" />
          <input
            type="text"
            placeholder="Search stages..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
        <CardWidthSlider
          value={cardWidth}
          min={200}
          max={500}
          onChange={width => setCardWidth('stages', width)}
        />
      </div>

      {/* Grid of stage cards */}
      <div 
        className="stage-grid"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))` }}
      >
        {filteredStages.map(stage => (
          <div key={stage.id} className="stage-card">
            <div
              className="stage-card-content"
              onClick={() => onStageSelect(stage)}
            >
              <div className="stage-card-icon">
                <i className="pi pi-sun" />
              </div>
              <div className="stage-card-info">
                <h3 className="stage-card-name">{stage.name}</h3>
                <p className="stage-card-date">
                  Updated: {new Date(stage.updatedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="stage-card-actions">
              <Button
                icon="pi pi-pencil"
                className="p-button-text p-button-sm"
                onClick={() => onStageSelect(stage)}
                tooltip="Edit"
              />
              <Button
                icon="pi pi-trash"
                className="p-button-text p-button-sm p-button-danger"
                onClick={e => {
                  e.stopPropagation()
                  onStageDelete(stage)
                }}
                tooltip="Delete"
              />
            </div>
          </div>
        ))}
      </div>

      {filteredStages.length === 0 && stages.length > 0 && (
        <div className="stage-grid-no-results">
          <p>No stages match your search</p>
        </div>
      )}
    </div>
  )
}

export default StageGrid
