import './ErrorState.css'

import { Button } from 'primereact/button'
import type { ReactNode } from 'react'

export interface ErrorStateProps {
  title?: ReactNode
  message: ReactNode
  /** Shown as a Retry button when provided. */
  onRetry?: () => void
  retryLabel?: string
  /** Override the default retry button with custom action(s). */
  action?: ReactNode
  variant?: 'block' | 'inline'
  className?: string
}

export function ErrorState({
  title,
  message,
  onRetry,
  retryLabel = 'Retry',
  action,
  variant = 'block',
  className,
}: ErrorStateProps) {
  const classes = [
    'mod-error-state',
    variant === 'inline' && 'mod-error-state--inline',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const renderedAction =
    action ??
    (onRetry ? (
      <Button
        label={retryLabel}
        icon="pi pi-refresh"
        className="p-button-sm"
        onClick={onRetry}
      />
    ) : null)

  return (
    <div className={classes} role="alert">
      <i
        className="pi pi-exclamation-triangle mod-error-state__icon"
        aria-hidden
      />
      {title && variant === 'block' && (
        <h3 className="mod-error-state__title">{title}</h3>
      )}
      <p className="mod-error-state__message">{message}</p>
      {renderedAction && (
        <div className="mod-error-state__action">{renderedAction}</div>
      )}
    </div>
  )
}
