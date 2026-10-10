import { Button } from 'primereact/button'
import { ContextMenu } from 'primereact/contextmenu'
import { type MenuItem } from 'primereact/menuitem'
import { useEffect, useMemo, useRef } from 'react'

import { DraggableTab } from '@/components/layout/DraggableTab'
import { useDockContext } from '@/contexts/DockContext'
import { useUIPreferencesStore } from '@/stores/uiPreferencesStore'
import { type Tab, type TabType } from '@/types'

import { useDockPanelActions } from './DockPanelActionsContext'
import { DockPinnedEntry } from './DockPinnedEntry'
import { PINNED_TAB_TYPES } from './pinnedTabs'

export type DockPlacement = 'left' | 'right' | 'top' | 'bottom'
export type DockOrientation = 'vertical' | 'horizontal'

interface DockBarProps {
  /** Where this bar sits relative to the content area. Drives orientation + border. */
  placement: DockPlacement
  tabs: Tab[]
  activeTab: string
  onTabSelect: (tabId: string) => void
  /** Shows the pinned entries; called with the kind of a closed one clicked. */
  onPinnedSelect?: (type: TabType) => void
  /**
   * Tab types already open in another panel. A pinned page open elsewhere is
   * visible there, so this dock shows no entry for it and only one panel can
   * address it at a time.
   */
  pinnedTypesOpenElsewhere?: readonly TabType[]
}

const ORIENTATION_BY_PLACEMENT: Record<DockPlacement, DockOrientation> = {
  left: 'vertical',
  right: 'vertical',
  top: 'horizontal',
  bottom: 'horizontal',
}

/**
 * Tooltips open outward, to the side of the bar away from the icon.
 *
 * The content area sits beside a vertical bar, so an outward tooltip opens
 * past the dock instead of into the page heading; a `bottom` tooltip on the
 * top tab dropped straight onto it. Horizontal bars keep their outward
 * position.
 */
const TOOLTIP_BY_PLACEMENT: Record<
  DockPlacement,
  'left' | 'right' | 'top' | 'bottom'
> = {
  left: 'right',
  right: 'left',
  top: 'bottom',
  bottom: 'top',
}

export function DockBar({
  placement,
  tabs,
  activeTab,
  onTabSelect,
  onPinnedSelect,
  pinnedTypesOpenElsewhere = [],
}: DockBarProps) {
  const {
    closeTab,
    onTabDragStart,
    onTabDragEnd,
    addTab,
    onDrop,
    onDragOver,
    onDragEnter,
    onDragLeave,
  } = useDockPanelActions()
  const menuRef = useRef<ContextMenu>(null)
  const { registerContextMenu, unregisterContextMenu, showContextMenu } =
    useDockContext()

  const orientation = ORIENTATION_BY_PLACEMENT[placement]
  const tooltipPosition = TOOLTIP_BY_PLACEMENT[placement]

  // The right-click context menu used to mirror every tab type as a power-user
  // shortcut. Picking what to open now lives entirely in the New Tab page
  // (tiles + Recently Closed), so the menu shrinks to a single entry whose
  // only job is to get the user to that page.
  const addMenuItems = useMemo<MenuItem[]>(
    () => [
      {
        label: 'New Tab',
        icon: 'pi pi-plus',
        command: () => addTab('newTab', 'New Tab'),
      },
    ],
    [addTab]
  )

  useEffect(() => {
    const menu = menuRef.current

    if (menu) {
      registerContextMenu(menuRef)
    }

    return () => {
      if (menu) {
        unregisterContextMenu(menuRef)
      }
    }
  }, [registerContextMenu, unregisterContextMenu])

  const handleBarContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    showContextMenu(menuRef, e)
  }

  const handleAddClick = (): void => {
    // Open a New Tab page (grid of asset-type tiles + recently closed). The
    // user picks the type there; the placeholder tab converts itself in place.
    addTab('newTab', 'New Tab')
  }

  const handleBarMouseDown = (e: React.MouseEvent): void => {
    // Middle-click on empty bar space opens a New Tab. Middle-click on a tab
    // closes that tab (handled in DraggableTab with stopPropagation), so this
    // only fires when the click lands on the bar background or the + button -
    // both of which should yield a New Tab.
    if (e.button === 1) {
      e.preventDefault() // Suppress autoscroll cursor.
      addTab('newTab', 'New Tab')
    }
  }

  const renderTab = (tab: Tab, closable = true) => (
    <DraggableTab
      key={tab.id}
      tab={tab}
      isActive={tab.id === activeTab}
      onSelect={() => onTabSelect(tab.id)}
      onClose={() => closeTab(tab.id)}
      onDragStart={onTabDragStart}
      onDragEnd={onTabDragEnd}
      tooltipPosition={tooltipPosition}
      closable={closable}
    />
  )

  // Which catalogue entries are pinned right now (Settings, Appearance). The
  // catalogue fixes the order so the dock stays stable as the user toggles.
  const pinnedTabTypes = useUIPreferencesStore(s => s.pinnedTabTypes)
  const pinnedEntries = PINNED_TAB_TYPES.filter(t => pinnedTabTypes.includes(t))

  // Undefined `onPinnedSelect` marks a bar that is not the main dock (the
  // right panel), which renders every tab as an ordinary closable one.
  //
  // A pinned page open in the other panel is already visible there, so it gets
  // no entry here: otherwise the same page would be addressable from two bars
  // and the entry's click would land in the other panel. An open one in this
  // panel always keeps its pinned slot.
  const pinnedSlots = onPinnedSelect
    ? pinnedEntries
        .map(type => ({ type, tab: tabs.find(t => t.type === type) }))
        .filter(
          slot =>
            slot.tab !== undefined ||
            !pinnedTypesOpenElsewhere.includes(slot.type)
        )
    : []

  // Match the pinned slot by tab instance, not id: two tabs of one pinned type
  // can share its singleton id, and each must keep a bar button.
  const pinnedTabs = pinnedSlots
    .map(slot => slot.tab)
    .filter((tab): tab is Tab => tab !== undefined)
  const unpinnedTabs = tabs.filter(tab => !pinnedTabs.includes(tab))

  return (
    <div
      className={`dock-bar dock-bar--${orientation} dock-bar--placement-${placement} dock-bar-${placement}`}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onContextMenu={handleBarContextMenu}
      onMouseDown={handleBarMouseDown}
    >
      {/* Tab icons: pinned entries first, then the other open tabs */}
      <div className="dock-tabs">
        {onPinnedSelect && pinnedSlots.length > 0 && (
          <div className="dock-pinned">
            {pinnedSlots.map(({ type, tab }) =>
              tab ? (
                renderTab(tab, false)
              ) : (
                <DockPinnedEntry
                  key={type}
                  type={type}
                  onSelect={onPinnedSelect}
                  tooltipPosition={tooltipPosition}
                />
              )
            )}
          </div>
        )}
        {unpinnedTabs.map(tab => renderTab(tab))}
      </div>

      {/* Add tab button - opens the New Tab page. Right-click on the bar
          shows the same shortcut as a context menu entry. */}
      <div className="dock-add">
        <Button
          icon="pi pi-plus"
          className="p-button-text p-button-rounded dock-add-button"
          onClick={handleAddClick}
          aria-label="Open new tab"
        />
        <ContextMenu
          model={addMenuItems}
          ref={menuRef}
          className="dock-add-menu"
          autoZIndex
        />
      </div>
    </div>
  )
}
