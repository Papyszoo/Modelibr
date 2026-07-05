import { Button } from 'primereact/button'
import { type DragEvent, type MouseEvent, type RefObject } from 'react'

import { EmptyState } from '@/shared/components/feedback'
import { type SoundDto } from '@/types'

import { SoundCard } from './SoundCard'

interface SoundGridContentProps {
  filteredSounds: SoundDto[]
  cardWidth: number
  selectedSoundIds: Set<number>
  draggedSoundId: number | null
  soundGridRef: RefObject<HTMLDivElement | null>
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
  totalSoundsCount: number
  onToggleSelection: (soundId: number, e: MouseEvent) => void
  onSoundClick: (sound: SoundDto) => void
  onContextMenu: (e: React.MouseEvent, sound: SoundDto) => void
  onSoundDragStart: (e: DragEvent, sound: SoundDto) => void
  onSoundDragEnd: () => void
  onGridMouseDown: (e: MouseEvent<HTMLDivElement>) => void
  onGridMouseMove: (e: MouseEvent<HTMLDivElement>) => void
  onGridMouseUp: () => void
  onLoadMore: () => void
}

export function SoundGridContent({
  filteredSounds,
  cardWidth,
  selectedSoundIds,
  draggedSoundId,
  soundGridRef,
  isAreaSelecting,
  selectionBox,
  hasNextPage,
  isFetchingNextPage,
  totalCount,
  totalSoundsCount,
  onToggleSelection,
  onSoundClick,
  onContextMenu,
  onSoundDragStart,
  onSoundDragEnd,
  onGridMouseDown,
  onGridMouseMove,
  onGridMouseUp,
  onLoadMore,
}: SoundGridContentProps) {
  if (filteredSounds.length === 0) {
    // Legacy class kept as an e2e selector alias (prompt 46).
    return (
      <EmptyState
        className="sound-list-empty"
        icon="pi-volume-up"
        title="No sounds in this category"
        message="Drag and drop audio files here to upload"
      />
    )
  }

  return (
    <>
      <div
        className="sound-grid-container"
        ref={soundGridRef}
        onMouseDown={onGridMouseDown}
        onMouseMove={onGridMouseMove}
        onMouseUp={onGridMouseUp}
        onMouseLeave={onGridMouseUp}
      >
        <div
          className="sound-grid"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
          }}
        >
          {filteredSounds.map(sound => (
            <SoundCard
              key={sound.id}
              sound={sound}
              isSelected={selectedSoundIds.has(sound.id)}
              isDragging={draggedSoundId === sound.id}
              onSelect={e => onToggleSelection(sound.id, e)}
              onClick={() => onSoundClick(sound)}
              onContextMenu={e => onContextMenu(e, sound)}
              onDragStart={e => onSoundDragStart(e, sound)}
              onDragEnd={onSoundDragEnd}
            />
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
                : `Load More (${totalSoundsCount} of ${totalCount})`
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
