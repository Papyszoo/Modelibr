import { type EnvironmentMapDto } from '@/features/environment-map/types'
import { getEnvironmentMapPrimaryPreviewUrl } from '@/features/environment-map/utils/environmentMapUtils'

import { EnvironmentMapCardImage } from './EnvironmentMapCardImage'

export interface SelectionBox {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

interface EnvironmentMapGridProps {
  environmentMaps: EnvironmentMapDto[]
  cardWidth: number
  selectedIds: Set<string>
  isAreaSelecting: boolean
  selectionBox: SelectionBox | null
  selectionSurfaceRef: React.RefObject<HTMLDivElement | null>
  onCardClick: (id: number, name: string) => void
  onCardContextMenu: (
    event: React.MouseEvent,
    environmentMap: EnvironmentMapDto
  ) => void
  onToggleSelection: (id: string, event: React.MouseEvent) => void
  onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void
  onMouseMove: (event: React.MouseEvent<HTMLDivElement>) => void
  onMouseUp: () => void
}

export function EnvironmentMapGrid({
  environmentMaps,
  cardWidth,
  selectedIds,
  isAreaSelecting,
  selectionBox,
  selectionSurfaceRef,
  onCardClick,
  onCardContextMenu,
  onToggleSelection,
  onMouseDown,
  onMouseMove,
  onMouseUp,
}: EnvironmentMapGridProps) {
  return (
    <div
      ref={selectionSurfaceRef}
      className={`environment-map-selection-surface${isAreaSelecting ? ' is-selecting' : ''}`}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <div
        className="environment-map-grid"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
        }}
      >
        {environmentMaps.map(environmentMap => {
          const previewUrl = getEnvironmentMapPrimaryPreviewUrl(environmentMap)
          const environmentMapId = String(environmentMap.id)
          const isSelected = selectedIds.has(environmentMapId)

          return (
            <article
              key={environmentMap.id}
              className={`environment-map-card${isSelected ? ' selected' : ''}`}
              data-environment-map-id={environmentMap.id}
              onClick={() =>
                onCardClick(environmentMap.id, environmentMap.name)
              }
              onContextMenu={event => onCardContextMenu(event, environmentMap)}
            >
              <div className="environment-map-card-preview">
                <button
                  type="button"
                  className="environment-map-select-checkbox"
                  onMouseDown={event => event.stopPropagation()}
                  onClick={event => onToggleSelection(environmentMapId, event)}
                  aria-label={`${isSelected ? 'Deselect' : 'Select'} ${environmentMap.name}`}
                  aria-pressed={isSelected}
                >
                  <i
                    className={`pi ${isSelected ? 'pi-check-square' : 'pi-stop'}`}
                  />
                </button>

                {previewUrl ? (
                  <EnvironmentMapCardImage
                    src={previewUrl}
                    alt={environmentMap.name}
                  />
                ) : (
                  <div className="environment-map-card-placeholder">
                    <i className="pi pi-globe" />
                    <span>No Preview</span>
                  </div>
                )}

                <div className="environment-map-card-overlay">
                  <span className="environment-map-card-name">
                    {environmentMap.name}
                  </span>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {isAreaSelecting && selectionBox ? (
        <div
          className="environment-map-selection-box"
          style={{
            left: Math.min(selectionBox.startX, selectionBox.currentX),
            top: Math.min(selectionBox.startY, selectionBox.currentY),
            width: Math.abs(selectionBox.currentX - selectionBox.startX),
            height: Math.abs(selectionBox.currentY - selectionBox.startY),
          }}
        />
      ) : null}
    </div>
  )
}
