import './FilterPanel.css'

import { Button } from 'primereact/button'
import { type ReactNode, useState } from 'react'

interface FilterPanelProps {
  children: ReactNode
  defaultCollapsed?: boolean
  activeCount?: number
  summaryLabel?: string
}

export function FilterPanel({
  children,
  defaultCollapsed = true,
  activeCount = 0,
  summaryLabel = 'Filters',
}: FilterPanelProps) {
  const [isOpen, setIsOpen] = useState(!defaultCollapsed)
  const summaryText =
    activeCount > 0 ? `${activeCount} active` : isOpen ? 'ready' : 'collapsed'

  return (
    <div className="list-filters-shell">
      <div className="list-filters-toolbar">
        <Button
          icon={isOpen ? 'pi pi-times' : 'pi pi-bars'}
          label={isOpen ? 'Close Filters' : 'Open Filters'}
          className="p-button-text p-button-sm"
          onClick={() => setIsOpen(current => !current)}
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Close filters' : 'Open filters'}
        />
        <span className="list-filters-summary">
          <strong>{summaryLabel}</strong>
          {` · ${summaryText}`}
        </span>
        <div className="list-filters-toolbar-spacer" />
      </div>

      {isOpen ? <div className="list-filters-panel">{children}</div> : null}
    </div>
  )
}
