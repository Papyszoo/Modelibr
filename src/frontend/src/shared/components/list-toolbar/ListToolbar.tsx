import './ListToolbar.css'

import { Button } from 'primereact/button'
import { type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'

/**
 * Outer wrapper that stacks the toolbar row, optional selection bar, and
 * any collapsible panels (search/filters) with consistent spacing.
 */
export function ListToolbar({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`list-toolbar-controls${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  )
}

/** Top row: actions on the left, count chip on the right. */
export function ListToolbarRow({ children }: { children: ReactNode }) {
  return <div className="list-toolbar">{children}</div>
}

export function ListToolbarActions({ children }: { children: ReactNode }) {
  return <div className="list-toolbar-actions">{children}</div>
}

interface ListToolbarButtonProps {
  icon?: string
  label?: string
  active?: boolean
  onClick?: (event: ReactMouseEvent<HTMLElement>) => void
  ariaLabel?: string
  ariaExpanded?: boolean
  ariaControls?: string
  tooltip?: string
  badge?: number
  disabled?: boolean
}

/** Pill-shaped toolbar button used for Search/Filters/Upload/Refresh/etc. */
export function ListToolbarButton({
  icon,
  label,
  active,
  onClick,
  ariaLabel,
  ariaExpanded,
  ariaControls,
  tooltip,
  badge,
  disabled,
}: ListToolbarButtonProps) {
  return (
    <Button
      icon={icon}
      label={label}
      className={`p-button-text p-button-sm list-toolbar-button${active ? ' is-active' : ''}`}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      tooltip={tooltip}
      tooltipOptions={tooltip ? { position: 'bottom' } : undefined}
      badge={badge !== undefined && badge > 0 ? String(badge) : undefined}
      badgeClassName="list-toolbar-badge"
      disabled={disabled}
    />
  )
}

/** Right-aligned count chip — e.g. "12 models". */
export function ListToolbarCount({
  icon = 'pi pi-box',
  count,
  unitLabel,
}: {
  icon?: string
  count: number
  unitLabel: string
}) {
  const label = `${count} ${unitLabel}${count === 1 ? '' : 's'}`
  return (
    <div className="list-toolbar-count" aria-live="polite">
      <i className={icon} />
      <span>{label}</span>
    </div>
  )
}

/** Sub-toolbar that appears when items are selected (bulk-action context). */
export function ListToolbarSelectionBar({ children }: { children: ReactNode }) {
  return (
    <div className="list-toolbar-selection-bar" aria-live="polite">
      {children}
    </div>
  )
}

export function ListToolbarSelectionSummary({
  children,
}: {
  children: ReactNode
}) {
  return <span className="list-toolbar-selection-summary">{children}</span>
}

export function ListToolbarSelectionActions({
  children,
}: {
  children: ReactNode
}) {
  return <div className="list-toolbar-selection-actions">{children}</div>
}

/**
 * Collapsible panel below the toolbar — used to host Search input or the
 * filters row. Animates open/close via grid-template-rows.
 */
export function ListToolbarPanel({
  id,
  open,
  children,
}: {
  id?: string
  open: boolean
  children: ReactNode
}) {
  return (
    <div id={id} className={`list-toolbar-panel${open ? ' is-open' : ''}`}>
      <div className="list-toolbar-panel-inner">{children}</div>
    </div>
  )
}

interface ListToolbarSearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

/** Search input chrome — magnifier icon + bare input on a card surface. */
export function ListToolbarSearchInput({
  value,
  onChange,
  placeholder = 'Search...',
}: ListToolbarSearchInputProps) {
  return (
    <div className="list-filters-search list-toolbar-search-panel">
      <i className="pi pi-search" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        // `search-input` is kept as a class alias for the e2e suite, which
        // selects this input that way across multiple list pages.
        className="list-filters-search-input search-input"
      />
    </div>
  )
}
