import { Button } from 'primereact/button'
import { type DragEvent, type MouseEvent, type RefObject } from 'react'

import { type ScriptDto } from '@/types'

import { ScriptCard } from './ScriptCard'

interface ScriptGridContentProps {
  filteredScripts: ScriptDto[]
  cardWidth: number
  selectedScriptIds: Set<number>
  draggedScriptId: number | null
  scriptGridRef: RefObject<HTMLDivElement | null>
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
  totalScriptsCount: number
  onToggleSelection: (scriptId: number, e: MouseEvent) => void
  onScriptClick: (script: ScriptDto) => void
  onContextMenu: (e: React.MouseEvent, script: ScriptDto) => void
  onScriptDragStart: (e: DragEvent, script: ScriptDto) => void
  onScriptDragEnd: () => void
  onGridMouseDown: (e: MouseEvent<HTMLDivElement>) => void
  onGridMouseMove: (e: MouseEvent<HTMLDivElement>) => void
  onGridMouseUp: () => void
  onLoadMore: () => void
}

export function ScriptGridContent({
  filteredScripts,
  cardWidth,
  selectedScriptIds,
  draggedScriptId,
  scriptGridRef,
  isAreaSelecting,
  selectionBox,
  hasNextPage,
  isFetchingNextPage,
  totalCount,
  totalScriptsCount,
  onToggleSelection,
  onScriptClick,
  onContextMenu,
  onScriptDragStart,
  onScriptDragEnd,
  onGridMouseDown,
  onGridMouseMove,
  onGridMouseUp,
  onLoadMore,
}: ScriptGridContentProps) {
  if (filteredScripts.length === 0) {
    return (
      <div className="script-list-empty">
        <i
          className="pi pi-code"
          style={{ fontSize: '3rem', marginBottom: '1rem' }}
        />
        <p>No scripts in this category</p>
        <p className="hint">Drag and drop source-code files here to upload</p>
      </div>
    )
  }

  return (
    <>
      <div
        className="script-grid-container"
        ref={scriptGridRef}
        onMouseDown={onGridMouseDown}
        onMouseMove={onGridMouseMove}
        onMouseUp={onGridMouseUp}
        onMouseLeave={onGridMouseUp}
      >
        <div
          className="script-grid"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
          }}
        >
          {filteredScripts.map(script => (
            <ScriptCard
              key={script.id}
              script={script}
              isSelected={selectedScriptIds.has(script.id)}
              isDragging={draggedScriptId === script.id}
              onSelect={e => onToggleSelection(script.id, e)}
              onClick={() => onScriptClick(script)}
              onContextMenu={e => onContextMenu(e, script)}
              onDragStart={e => onScriptDragStart(e, script)}
              onDragEnd={onScriptDragEnd}
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
                : `Load More (${totalScriptsCount} of ${totalCount})`
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
