import './EmptyState.css'

import type { DragEventHandler, ReactNode } from 'react'

export interface EmptyStateProps {
  /** PrimeIcons class name without the `pi-` prefix is fine, full `pi pi-x` also accepted. */
  icon?: string
  title?: ReactNode
  message?: ReactNode
  /** Rendered below the message. Typically a primary action button. */
  action?: ReactNode
  variant?: 'default' | 'compact'
  /** Marks the component as a drop target (border highlights via `dragOver` prop). */
  dragOver?: boolean
  className?: string
  onDrop?: DragEventHandler<HTMLDivElement>
  onDragOver?: DragEventHandler<HTMLDivElement>
  onDragEnter?: DragEventHandler<HTMLDivElement>
  onDragLeave?: DragEventHandler<HTMLDivElement>
}

function normalizeIcon(icon: string): string {
  return icon.startsWith('pi ')
    ? icon
    : `pi ${icon.startsWith('pi-') ? icon : `pi-${icon}`}`
}

export function EmptyState({
  icon = 'pi-inbox',
  title = 'Nothing here yet',
  message,
  action,
  variant = 'default',
  dragOver = false,
  className,
  onDrop,
  onDragOver,
  onDragEnter,
  onDragLeave,
}: EmptyStateProps) {
  const classes = [
    'mod-empty-state',
    variant === 'compact' && 'mod-empty-state--compact',
    dragOver && 'mod-empty-state--drag-over',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={classes}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    >
      <i
        className={`${normalizeIcon(icon)} mod-empty-state__icon`}
        aria-hidden
      />
      {title && <h3 className="mod-empty-state__title">{title}</h3>}
      {message && <p className="mod-empty-state__message">{message}</p>}
      {action && <div className="mod-empty-state__action">{action}</div>}
    </div>
  )
}
