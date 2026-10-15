import '../DraggableTab.css'

import { Tooltip } from 'primereact/tooltip'
import { type JSX, useRef } from 'react'

import { getTabLabel } from '@/stores/navigationStore'
import { type TabType } from '@/types'

import { getTabIcon } from '../tabIcons'

interface DockPinnedEntryProps {
  type: TabType
  onSelect: (type: TabType) => void
  tooltipPosition: 'left' | 'right' | 'top' | 'bottom'
}

/**
 * A pinned dock entry whose tab is not open in this panel: it looks like an
 * inactive tab and opens (or focuses) that tab when clicked.
 */
export function DockPinnedEntry({
  type,
  onSelect,
  tooltipPosition,
}: DockPinnedEntryProps): JSX.Element {
  const ref = useRef<HTMLButtonElement | null>(null)
  const label = getTabLabel(type)
  const tooltipId = `dock-pin-${type}`

  const handleClick = (): void => {
    // The opened tab replaces this entry under the pointer, so hide the
    // tooltip first or it is orphaned (same reason as DraggableTab).
    ref.current?.dispatchEvent(new MouseEvent('mouseleave'))
    onSelect(type)
  }

  return (
    <>
      <Tooltip
        target={`#${CSS.escape(tooltipId)}`}
        showDelay={0}
        hideDelay={0}
      />
      <button
        ref={ref}
        id={tooltipId}
        type="button"
        // p-component opts out of the global plain-button look, as the tab's
        // own close button does.
        className="dock-pin p-component"
        aria-label={label}
        data-pr-tooltip={label}
        data-pr-position={tooltipPosition}
        onClick={handleClick}
      >
        <i className={`pi ${getTabIcon(type)} tab-icon`} aria-hidden="true" />
      </button>
    </>
  )
}
