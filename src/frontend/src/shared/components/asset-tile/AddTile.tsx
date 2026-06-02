/**
 * AddTile — the dashed "Add X" call-to-action tile.
 *
 * Always square (aspect-ratio: 1) regardless of the grid's active variant.
 * The dashed border is the ONLY place in the system where that pattern should
 * appear at rest (not counting drag-over overlays).
 *
 * Styles live in AssetTile.css (.asset-tile-add / .asset-tile-add-content).
 */
export interface AddTileProps {
  label: string
  icon?: string
  onClick: () => void
}

export function AddTile({ label, icon = 'pi pi-plus', onClick }: AddTileProps) {
  return (
    <div
      className="asset-tile-add"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <div className="asset-tile-add-content">
        <i className={icon} />
        <span>{label}</span>
      </div>
    </div>
  )
}
