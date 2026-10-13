import { Button } from 'primereact/button'
import { type DragEvent, type MouseEvent, type RefObject } from 'react'

import { getFilePreviewUrl } from '@/features/models/api/modelApi'
import { EmptyState } from '@/shared/components/feedback'
import { AreaSelectionBox } from '@/shared/components/selection'
import { type SpriteDto } from '@/types'
import { formatFileSize } from '@/utils/fileUtils'

interface SpriteGridContentProps {
  filteredSprites: SpriteDto[]
  cardWidth: number
  selectedSpriteIds: Set<number>
  draggedSpriteId: number | null
  spriteGridRef: RefObject<HTMLDivElement | null>
  isAreaSelecting: boolean
  selectionBox: {
    startX: number
    startY: number
    currentX: number
    currentY: number
  } | null
  hasNextPage: boolean
  isFetchingNextPage: boolean
  totalCount: number
  totalSpritesCount: number
  onToggleSelection: (spriteId: number, e: MouseEvent) => void
  onSpriteClick: (sprite: SpriteDto) => void
  onContextMenu: (
    e: React.MouseEvent<HTMLDivElement>,
    sprite: SpriteDto
  ) => void
  onSpriteDragStart: (e: DragEvent<HTMLDivElement>, sprite: SpriteDto) => void
  onSpriteDragEnd: () => void
  onGridMouseDown: (e: MouseEvent<HTMLDivElement>) => void
  onGridMouseMove: (e: MouseEvent<HTMLDivElement>) => void
  onGridMouseUp: () => void
  onLoadMore: () => void
}

function getSpriteTypeName(type: number): string {
  switch (type) {
    case 1:
      return 'Static'
    case 2:
      return 'Sprite Sheet'
    case 3:
      return 'GIF'
    case 4:
      return 'APNG'
    case 5:
      return 'Animated WebP'
    default:
      return 'Unknown'
  }
}

export function SpriteGridContent({
  filteredSprites,
  cardWidth,
  selectedSpriteIds,
  draggedSpriteId,
  spriteGridRef,
  isAreaSelecting,
  selectionBox,
  hasNextPage,
  isFetchingNextPage,
  totalCount,
  totalSpritesCount,
  onToggleSelection,
  onSpriteClick,
  onContextMenu,
  onSpriteDragStart,
  onSpriteDragEnd,
  onGridMouseDown,
  onGridMouseMove,
  onGridMouseUp,
  onLoadMore,
}: SpriteGridContentProps) {
  if (filteredSprites.length === 0) {
    // Legacy class kept as an e2e selector alias (prompt 46).
    return (
      <EmptyState
        className="sprite-list-empty"
        icon="pi-image"
        title="No sprites in this category"
        message="Drag and drop image files here to upload"
      />
    )
  }

  return (
    <>
      <div
        className="sprite-grid-container"
        ref={spriteGridRef}
        onMouseDown={onGridMouseDown}
        onMouseMove={onGridMouseMove}
        onMouseUp={onGridMouseUp}
        onMouseLeave={onGridMouseUp}
      >
        <div
          className="sprite-grid"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
          }}
        >
          {filteredSprites.map(sprite => (
            <div
              key={sprite.id}
              data-sprite-id={sprite.id}
              className={`sprite-card ${draggedSpriteId === sprite.id ? 'dragging' : ''} ${selectedSpriteIds.has(sprite.id) ? 'selected' : ''}`}
              onClick={() => onSpriteClick(sprite)}
              onContextMenu={e => onContextMenu(e, sprite)}
              draggable
              onDragStart={e => onSpriteDragStart(e, sprite)}
              onDragEnd={onSpriteDragEnd}
            >
              <button
                type="button"
                className="sprite-select-checkbox"
                onClick={e => onToggleSelection(sprite.id, e)}
                aria-label={`${selectedSpriteIds.has(sprite.id) ? 'Deselect' : 'Select'} ${sprite.name}`}
                aria-pressed={selectedSpriteIds.has(sprite.id)}
              >
                <i
                  className={`pi ${selectedSpriteIds.has(sprite.id) ? 'pi-check-square' : 'pi-stop'}`}
                />
              </button>
              <div className="sprite-preview">
                <img
                  src={getFilePreviewUrl(sprite.fileId.toString())}
                  alt={sprite.name}
                  onError={e => {
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                  }}
                />
              </div>
              <div className="sprite-info">
                <h3 className="sprite-name">{sprite.name}</h3>
                <div className="sprite-meta">
                  <span className="sprite-type">
                    {getSpriteTypeName(sprite.spriteType)}
                  </span>
                </div>
                <span className="sprite-size">
                  {formatFileSize(sprite.fileSizeBytes)}
                </span>
              </div>
            </div>
          ))}
        </div>
        {isAreaSelecting && selectionBox && (
          <AreaSelectionBox box={selectionBox} className="selection-box" />
        )}
      </div>

      {hasNextPage && (
        <div
          style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}
        >
          <Button
            label={
              isFetchingNextPage
                ? 'Loading...'
                : `Load More (${totalSpritesCount} of ${totalCount})`
            }
            icon={
              isFetchingNextPage
                ? 'pi pi-spinner pi-spin'
                : 'pi pi-chevron-down'
            }
            onClick={onLoadMore}
            disabled={isFetchingNextPage}
            className="p-button-outlined"
          />
        </div>
      )}
    </>
  )
}
