import { Button } from 'primereact/button'
import './StageListHeader.css'

interface StageListHeaderProps {
  onCreateClick: () => void
}

function StageListHeader({ onCreateClick }: StageListHeaderProps) {
  return (
    <div className="stage-list-header">
      <div className="header-content">
        <div className="header-title">
          <h2>Stages</h2>
          <p className="header-subtitle">
            Visual environments for 3D scene composition
          </p>
        </div>
        <div className="header-actions">
          <Button
            label="Create Stage"
            icon="pi pi-plus"
            onClick={onCreateClick}
            className="p-button-primary"
          />
        </div>
      </div>
    </div>
  )
}

export default StageListHeader
