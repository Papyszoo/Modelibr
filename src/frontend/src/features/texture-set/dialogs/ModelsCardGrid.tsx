import { Button } from 'primereact/button'
import { ModelSummaryDto } from '../../../types'
import ThumbnailDisplay from '../../thumbnail/components/ThumbnailDisplay'
import './ModelsCardGrid.css'

interface ModelsCardGridProps {
  models: ModelSummaryDto[]
  onDisassociateModel: (model: ModelSummaryDto) => void
  onManageAssociations: () => void
}

export default function ModelsCardGrid({
  models,
  onDisassociateModel,
  onManageAssociations,
}: ModelsCardGridProps) {
  return (
    <>
      <div className="tab-header">
        <h4>Associated Models ({models.length})</h4>
        <Button
          label="Link Model"
          icon="pi pi-link"
          onClick={onManageAssociations}
          size="small"
        />
      </div>

      {models.length === 0 ? (
        <div className="models-empty-state">
          <i className="pi pi-box" />
          <p>No models linked to this texture set</p>
          <Button
            label="Link Your First Model"
            icon="pi pi-link"
            onClick={onManageAssociations}
            size="small"
          />
        </div>
      ) : (
        <div className="models-card-grid">
          {models.map(model => (
            <div key={model.id} className="model-card">
              <Button
                icon="pi pi-times"
                className="model-card-delete"
                onClick={() => onDisassociateModel(model)}
                tooltip="Unlink model"
                tooltipOptions={{ position: 'left' }}
                rounded
                text
                severity="danger"
                size="small"
              />
              <div className="model-card-thumbnail">
                <ThumbnailDisplay modelId={model.id.toString()} />
                <div className="model-card-overlay">
                  <span className="model-card-name">{model.name}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
