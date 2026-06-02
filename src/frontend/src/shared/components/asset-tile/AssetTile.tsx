import './AssetTile.css'

import { type ReactNode } from 'react'

/**
 * AssetTile — dumb, presentational card used by every asset tab.
 *
 * Knows nothing about asset types. Callers pass a `media` node (an <img> or
 * a placeholder), the item `name`, and optional extras. The tile mirrors the
 * `.model-card` look from ModelGrid.
 */
export interface AssetTileProps {
  /** The thumbnail area — an <img> element or a placeholder node. */
  media: ReactNode
  /** Primary label shown in the bottom overlay. */
  name: string
  /**
   * Optional secondary line in the overlay (e.g. "3 variants", duration).
   * Rendered below the name in a muted colour.
   */
  meta?: ReactNode
  /**
   * Shape variant:
   * - 'square' (default) — aspect-ratio 1:1, image covers the area.
   * - 'wide' — aspect-ratio 2:1 with object-fit: contain (env maps).
   */
  variant?: 'square' | 'wide'
  /** Highlights the tile with a primary-colour ring. */
  selected?: boolean
  /**
   * Optional node rendered in the top-right corner — typically a
   * PrimeReact <Checkbox> used inside add-dialogs.
   */
  checkbox?: ReactNode
  onClick?: (e: React.MouseEvent) => void
  onContextMenu?: (e: React.MouseEvent) => void
  className?: string
  /**
   * Extra `data-*` attributes spread on the root element — stable hooks for
   * tests/automation to target a specific item, e.g.
   * `{ 'data-texture-set-id': id }`.
   */
  dataAttributes?: Record<`data-${string}`, string | number>
}

export function AssetTile({
  media,
  name,
  meta,
  variant = 'square',
  selected = false,
  checkbox,
  onClick,
  onContextMenu,
  className,
  dataAttributes,
}: AssetTileProps) {
  const tileClass = [
    'asset-tile',
    variant === 'wide' ? 'asset-tile--wide' : '',
    selected ? 'is-selected' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={tileClass}
      onClick={onClick}
      onContextMenu={onContextMenu}
      {...dataAttributes}
    >
      {checkbox ? <div className="asset-tile-checkbox">{checkbox}</div> : null}

      <div className="asset-tile-media">{media}</div>

      <div className="asset-tile-overlay">
        <span className="asset-tile-name">{name}</span>
        {meta ? <span className="asset-tile-meta">{meta}</span> : null}
      </div>
    </div>
  )
}

/**
 * Helper: a centred icon + optional text placeholder for tiles with no image.
 * Callers pass this as the `media` prop when no preview URL is available.
 */
export function AssetTilePlaceholder({
  icon,
  label,
}: {
  icon: string
  label?: string
}) {
  return (
    <div className="asset-tile-placeholder">
      <i className={icon} />
      {label ? <span>{label}</span> : null}
    </div>
  )
}
