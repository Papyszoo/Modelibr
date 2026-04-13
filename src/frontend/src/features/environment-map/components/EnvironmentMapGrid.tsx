import { forwardRef } from 'react'
import { type GridComponents, VirtuosoGrid } from 'react-virtuoso'

import { type EnvironmentMapDto } from '@/features/environment-map/types'

import { EnvironmentMapThumbnailDisplay } from './EnvironmentMapThumbnailDisplay'

export interface SelectionBox {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

const gridComponents: GridComponents<{ cardWidth: number }> = {
  List: forwardRef(({ children, context, ...props }, ref) => (
    <div
      ref={ref}
      {...props}
      className="environment-map-grid"
      style={{
        ...props.style,
        gridTemplateColumns: `repeat(auto-fill, minmax(${context?.cardWidth ?? 180}px, 1fr))`,
      }}
    >
      {children}
    </div>
  )),
  Item: ({ children, ...props }) => (
    <div {...props} style={props.style}>
      {children}
    </div>
  ),
}

interface EnvironmentMapGridProps {
  environmentMaps: EnvironmentMapDto[]
  cardWidth: number
  selectedIds: Set<string>
  isAreaSelecting: boolean
  selectionBox: SelectionBox | null
  selectionSurfaceRef: React.RefObject<HTMLDivElement | null>
  scrollParent: HTMLDivElement | null
  onCardClick: (id: number, name: string) => void
  onCardContextMenu: (
    event: React.MouseEvent,
    environmentMap: EnvironmentMapDto
  ) => void
  onToggleSelection: (id: string, event: React.MouseEvent) => void
  onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void
  onMouseMove: (event: React.MouseEvent<HTMLDivElement>) => void
  onMouseUp: () => void
  onEndReached: () => void
}

export function EnvironmentMapGrid({
  environmentMaps,
  cardWidth,
  selectedIds,
  isAreaSelecting,
  selectionBox,
  selectionSurfaceRef,
  scrollParent,
  onCardClick,
  onCardContextMenu,
  onToggleSelection,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onEndReached,
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
      <VirtuosoGrid
        customScrollParent={scrollParent ?? undefined}
        totalCount={environmentMaps.length}
        overscan={200}
        components={gridComponents}
        context={{ cardWidth }}
        endReached={onEndReached}
        itemContent={index => {
          const environmentMap = environmentMaps[index]
          if (!environmentMap) return null

          const environmentMapId = String(environmentMap.id)
          const isSelected = selectedIds.has(environmentMapId)

          return (
            <article
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

                <EnvironmentMapThumbnailDisplay
                  environmentMapId={environmentMap.id}
                  name={environmentMap.name}
                />

                <div className="environment-map-card-overlay">
                  <span className="environment-map-card-name">
                    {environmentMap.name}
                  </span>
                </div>
              </div>
            </article>
          )
        }}
      />

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
