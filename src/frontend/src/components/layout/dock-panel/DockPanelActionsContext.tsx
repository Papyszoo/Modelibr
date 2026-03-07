import { createContext, useContext } from 'react'

import { type Tab } from '@/types'

export interface DockPanelActions {
  /** Add a new tab of the given type */
  addTab: (type: Tab['type'], title: string) => void
  /** Reopen a previously closed tab */
  reopenTab: (tab: Tab) => void
  /** Close a tab by ID */
  closeTab: (tabId: string) => void
  /** Begin dragging a tab */
  onTabDragStart: (tab: Tab) => void
  /** End tab drag */
  onTabDragEnd: () => void
  /** Handle drop on this panel (cross-panel / cross-window) */
  onDrop: (e: React.DragEvent) => void
  /** Handle drag over this panel */
  onDragOver: (e: React.DragEvent) => void
  /** Handle drag enter on this panel */
  onDragEnter: (e: React.DragEvent) => void
  /** Handle drag leave from this panel */
  onDragLeave: (e: React.DragEvent) => void
}

export const DockPanelActionsContext = createContext<DockPanelActions | null>(
  null
)

export function useDockPanelActions(): DockPanelActions {
  const ctx = useContext(DockPanelActionsContext)
  if (!ctx) {
    throw new Error(
      'useDockPanelActions must be used within a DockPanelActionsContext.Provider'
    )
  }
  return ctx
}
