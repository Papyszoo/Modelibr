import './AssetGrid.css'

import { type ReactNode } from 'react'

/**
 * AssetGrid — responsive auto-fill CSS Grid that wraps AssetTile children.
 *
 * The column min-width is driven by `--asset-card-width` (set inline from
 * `cardWidth`) so a slider can control density while responsive @media rules
 * keep the layout sane on narrow screens.
 */
export interface AssetGridProps {
  /** Minimum card width in pixels. Defaults to 180. */
  cardWidth?: number
  children: ReactNode
  className?: string
}

export function AssetGrid({
  cardWidth = 180,
  children,
  className,
}: AssetGridProps) {
  return (
    <div
      className={['asset-grid', className].filter(Boolean).join(' ')}
      style={{ '--asset-card-width': `${cardWidth}px` } as React.CSSProperties}
    >
      {children}
    </div>
  )
}
