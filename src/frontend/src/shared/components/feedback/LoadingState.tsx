import './LoadingState.css'

import { ProgressBar } from 'primereact/progressbar'
import type { ReactNode } from 'react'

export interface LoadingStateProps {
  message?: ReactNode
  /** `block` shows a card with a progress bar; `inline` shows a small spinner row. */
  variant?: 'block' | 'inline'
  className?: string
}

export function LoadingState({
  message = 'Loading…',
  variant = 'block',
  className,
}: LoadingStateProps) {
  const classes = [
    'mod-loading-state',
    variant === 'inline' && 'mod-loading-state--inline',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes} role="status" aria-live="polite">
      {variant === 'block' ? (
        <ProgressBar mode="indeterminate" className="mod-loading-state__bar" />
      ) : (
        <i
          className="pi pi-spin pi-spinner mod-loading-state__spinner"
          aria-hidden
        />
      )}
      {message && <p className="mod-loading-state__message">{message}</p>}
    </div>
  )
}
