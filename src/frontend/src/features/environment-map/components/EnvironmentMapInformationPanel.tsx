import { type EnvironmentMapDto } from '@/features/environment-map/types'
import { type EnvironmentMapPreviewOption } from '@/features/environment-map/utils/environmentMapUtils'

interface EnvironmentMapInformationPanelProps {
  selectedPreview: EnvironmentMapPreviewOption | null
  environmentMap: EnvironmentMapDto
}

export function EnvironmentMapInformationPanel({
  selectedPreview,
  environmentMap,
}: EnvironmentMapInformationPanelProps) {
  return (
    <div className="environment-map-viewer-panel-body">
      <dl className="environment-map-detail-list">
        <div>
          <dt>Preview size</dt>
          <dd>{selectedPreview?.label ?? 'Original'}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{selectedPreview?.sourceType ?? 'Single'}</dd>
        </div>
        <div>
          <dt>Projection</dt>
          <dd>{selectedPreview?.projectionType ?? 'Equirectangular'}</dd>
        </div>
        <div>
          <dt>Variants</dt>
          <dd>{environmentMap.variantCount}</dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>{new Date(environmentMap.updatedAt).toLocaleString()}</dd>
        </div>
      </dl>
    </div>
  )
}
