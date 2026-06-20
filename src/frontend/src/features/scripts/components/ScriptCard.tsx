import './ScriptCard.css'

import { memo } from 'react'

import { type ScriptDto } from '@/types'

import { getLanguageLabel } from '../utils/languages'

interface ScriptCardProps {
  script: ScriptDto
  isSelected: boolean
  isDragging: boolean
  onSelect: (e: React.MouseEvent) => void
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** The file extension (without dot) for the corner glyph, derived from the file name. */
function fileExtension(script: ScriptDto): string {
  const fromName = script.fileName?.split('.').pop()
  if (fromName && fromName !== script.fileName) return fromName.toUpperCase()
  return script.language.slice(0, 4).toUpperCase()
}

export const ScriptCard = memo(function ScriptCard({
  script,
  isSelected,
  isDragging,
  onSelect,
  onClick,
  onContextMenu,
  onDragStart,
  onDragEnd,
}: ScriptCardProps) {
  // Description lives in the card tooltip (and is searchable) rather than
  // taking up card space — the card itself stays icon-forward.
  const tooltip = script.description
    ? `${script.name}\n\n${script.description}`
    : script.name

  return (
    <div
      className={`script-card ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
      data-script-id={script.id}
      data-testid="script-card"
      data-language={script.language}
      title={tooltip}
      onClick={onClick}
      onContextMenu={onContextMenu}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="script-select-checkbox" onClick={onSelect}>
        <i className={`pi ${isSelected ? 'pi-check-square' : 'pi-stop'}`} />
      </div>

      {/* File-like sheet with a folded corner and the extension glyph. */}
      <div className="script-file-sheet">
        <span className="script-file-fold" aria-hidden="true" />
        <span className="script-file-ext">{fileExtension(script)}</span>
        <span className="script-file-lang" data-testid="script-language-badge">
          {getLanguageLabel(script.language)}
        </span>
      </div>

      <div className="script-info">
        <h3 className="script-name">{script.name}</h3>
        <div className="script-meta">
          <span className="script-lines">{script.lineCount} lines</span>
          <span className="script-size">
            {formatFileSize(script.fileSizeBytes)}
          </span>
        </div>
      </div>
    </div>
  )
})
