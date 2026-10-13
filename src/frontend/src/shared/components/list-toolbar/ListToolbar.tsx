import './ListToolbar.css'

import { Button } from 'primereact/button'
import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useRef,
} from 'react'

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

/** Right-aligned count chip - e.g. "12 models". */
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
    <div
      className="list-toolbar-selection-bar"
      aria-live="polite"
      data-testid="selection-bar"
    >
      {children}
    </div>
  )
}

export function ListToolbarSelectionSummary({
  children,
}: {
  children: ReactNode
}) {
  return (
    <span
      className="list-toolbar-selection-summary"
      data-testid="selection-count"
    >
      {children}
    </span>
  )
}

export function ListToolbarSelectionActions({
  children,
}: {
  children: ReactNode
}) {
  return <div className="list-toolbar-selection-actions">{children}</div>
}

interface ListSelectionBarProps {
  /** Number of selected items; the bar renders only when this is > 0. */
  count: number
  /** Number of selectable (visible/filtered) items - bounds Select All. */
  visibleCount: number
  /** Singular noun, e.g. "model"; the summary pluralizes it. */
  unitLabel: string
  /**
   * Opens the list's bulk-action menu. Omit only when the list has no bulk
   * actions at all.
   */
  onBulkActionsClick?: (event: ReactMouseEvent<HTMLElement>) => void
  onSelectAllClick: () => void
  onDeselectAllClick: () => void
}

/**
 * PrimeReact's ContextMenu positions itself from the pointer coordinates of the
 * event it is handed (`pageX`/`pageY`). Activating the button from the keyboard
 * (Enter/Space) fires a click at 0,0, which dropped the bulk menu in the
 * window's top-left corner instead of under the button. Anchor such events on
 * the button's own rect.
 */
function anchorMenuEvent(event: ReactMouseEvent<HTMLElement>): void {
  if (event.pageX !== 0 || event.pageY !== 0) return

  const rect = event.currentTarget?.getBoundingClientRect()
  if (!rect) return

  event.pageX = rect.left
  event.pageY = rect.bottom
}

/**
 * The one selection bar composition for every list: count summary, Bulk
 * actions, Select All, Deselect All. Renders nothing when nothing is
 * selected. Pages pass counts + handlers, never their own bar layout.
 */
export function ListSelectionBar({
  count,
  visibleCount,
  unitLabel,
  onBulkActionsClick,
  onSelectAllClick,
  onDeselectAllClick,
}: ListSelectionBarProps) {
  if (count === 0) return null

  const countLabel = `${count} ${unitLabel}${count === 1 ? '' : 's'}`

  return (
    <ListToolbarSelectionBar>
      <ListToolbarSelectionSummary>
        {countLabel} selected.
      </ListToolbarSelectionSummary>
      <ListToolbarSelectionActions>
        {onBulkActionsClick ? (
          <ListToolbarButton
            icon="pi pi-list-check"
            label="Bulk actions"
            active
            onClick={event => {
              anchorMenuEvent(event)
              onBulkActionsClick(event)
            }}
            ariaLabel={`Bulk actions for ${countLabel}`}
          />
        ) : null}
        <ListToolbarButton
          label="Select All"
          onClick={onSelectAllClick}
          disabled={visibleCount === 0 || count >= visibleCount}
        />
        <ListToolbarButton label="Deselect All" onClick={onDeselectAllClick} />
      </ListToolbarSelectionActions>
    </ListToolbarSelectionBar>
  )
}

/**
 * Collapsible panel below the toolbar - used to host Search input or the
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
  /**
   * Focus the input when this flips to true - used to put the caret straight
   * into the field when the collapsible search panel is opened. The input
   * stays mounted (panel only animates height), so an effect, not the native
   * `autoFocus` attribute, is what actually moves focus on each open.
   */
  autoFocus?: boolean
}

/** Search input chrome - magnifier icon + bare input on a card surface. */
export function ListToolbarSearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  autoFocus = false,
}: ListToolbarSearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!autoFocus) return
    // Defer a tick so focus lands after the panel begins opening.
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [autoFocus])

  return (
    <div className="list-filters-search list-toolbar-search-panel">
      <i className="pi pi-search" />
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        // `search-input` is kept as a class alias for the e2e suite, which
        // selects this input that way across multiple list pages.
        className="list-filters-search-input search-input"
      />
      {value ? (
        <button
          type="button"
          className="list-filters-search-clear"
          aria-label="Clear search"
          data-testid="search-clear"
          onClick={() => {
            onChange('')
            inputRef.current?.focus()
          }}
        >
          <i className="pi pi-times" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}
