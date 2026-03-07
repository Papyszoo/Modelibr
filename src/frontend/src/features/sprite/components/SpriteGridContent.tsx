import { Button } from 'primereact/button'
import { Checkbox } from 'primereact/checkbox'
import { type DragEvent, type MouseEvent, type RefObject } from 'react'

import { getFilePreviewUrl } from '@/features/models/api/modelApi'
import { type SpriteDto } from '@/types'

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
    return (
      <div className="sprite-list-empty">
        <i
          className="pi pi-image"
          style={{ fontSize: '3rem', marginBottom: '1rem' }}
        />
        <p>No sprites in this category</p>
        <p className="hint">Drag and drop image files here to upload</p>
      </div>
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
              <div
                className="sprite-select-checkbox"
                onClick={e => onToggleSelection(sprite.id, e)}
              >
                <Checkbox checked={selectedSpriteIds.has(sprite.id)} readOnly />
              </div>
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
          <div
            className="selection-box"
            style={{
              left: Math.min(selectionBox.startX, selectionBox.currentX),
              top: Math.min(selectionBox.startY, selectionBox.currentY),
              width: Math.abs(selectionBox.currentX - selectionBox.startX),
              height: Math.abs(selectionBox.currentY - selectionBox.startY),
            }}
          />
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
