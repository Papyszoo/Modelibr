import { useCallback, useEffect, useState } from 'react'

import { createTab, useNavigationStore } from '@/stores/navigationStore'
import { type TabType } from '@/types'

import { OPEN_SEARCH_EVENT } from '../searchEvents'
import { type SearchResultItem, type SearchResultType } from '../types'
import { SearchPalette } from './SearchPalette'

// Map a search result to the tab it should open. Sprites and sounds have no
// per-item viewer yet, so they open their list tab (the closest destination).
const RESULT_TAB: Record<SearchResultType, { type: TabType; usesId: boolean }> =
  {
    model: { type: 'modelViewer', usesId: true },
    textureSet: { type: 'textureSetViewer', usesId: true },
    environmentMap: { type: 'environmentMapViewer', usesId: true },
    pack: { type: 'packViewer', usesId: true },
    project: { type: 'projectViewer', usesId: true },
    sprite: { type: 'sprites', usesId: false },
    sound: { type: 'sounds', usesId: false },
    script: { type: 'scriptViewer', usesId: true },
  }

interface GlobalSearchPaletteProps {
  windowId: string
  /** Panel that search results open into. */
  side?: 'left' | 'right'
}

/**
 * Window-level search palette: owns the Ctrl/Cmd+K shortcut and opens results
 * into a panel via the shared navigation store, reusing the same tab mechanics
 * as every other open-in-tab action.
 */
export function GlobalSearchPalette({
  windowId,
  side = 'left',
}: GlobalSearchPaletteProps) {
  const [visible, setVisible] = useState(false)
  const openTab = useNavigationStore(s => s.openTab)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setVisible(open => !open)
      }
    }
    // A visible affordance (e.g. a toolbar button) opens the palette by
    // dispatching this event, so the button need not own the open state.
    const onOpenRequest = () => setVisible(true)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener(OPEN_SEARCH_EVENT, onOpenRequest)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpenRequest)
    }
  }, [])

  const handleSelect = useCallback(
    (item: SearchResultItem) => {
      const target = RESULT_TAB[item.type]
      const tab = createTab(
        target.type,
        target.usesId ? String(item.id) : undefined,
        item.name
      )
      openTab(windowId, side, tab)
    },
    [openTab, side, windowId]
  )

  return (
    <SearchPalette
      visible={visible}
      onClose={() => setVisible(false)}
      onSelectResult={handleSelect}
    />
  )
}
