import { act, render, screen } from '@testing-library/react'

import { SplitterLayout } from '@/components/layout/SplitterLayout'
import { createTab, useNavigationStore } from '@/stores/navigationStore'
import { type Tab } from '@/types'

// App-shell seams: the window identity, deep links, the search overlay and the
// panel internals are not what this file tests - the panel arrangement is.
jest.mock('@/hooks/useWindowInit', () => ({ useWindowInit: () => 'w1' }))
jest.mock('@/hooks/useDeepLinkHandler', () => ({
  useDeepLinkHandler: () => undefined,
}))
jest.mock('@/features/search', () => ({ GlobalSearchPalette: () => null }))
jest.mock('../DockPanelContent', () => ({
  DockPanelContent: ({
    side,
    tabs,
    setDraggedTab,
    onPinnedSelect,
  }: {
    side: string
    tabs: Tab[]
    setDraggedTab: (tab: Tab | null) => void
    onPinnedSelect?: unknown
  }) => (
    <div
      data-testid={`panel-${side}`}
      data-tabs={tabs.map(t => t.id).join(',')}
      data-pinned={onPinnedSelect ? 'yes' : 'no'}
    >
      <button onClick={() => setDraggedTab(tabs[0] ?? null)}>
        drag-{side}
      </button>
    </div>
  ),
}))

const right = (tab: Tab): Tab => ({
  ...tab,
  params: { ...tab.params, panel: 'right' },
})

function seed(tabs: Tab[]) {
  useNavigationStore.setState({
    activeWindows: {
      w1: {
        tabs,
        activeTabId: tabs[0]?.id ?? null,
        activeRightTabId: null,
        splitterSize: 50,
        lastActiveAt: new Date().toISOString(),
      },
    },
    recentlyClosedTabs: [],
    recentlyClosedWindows: [],
  })
}

const layout = () => document.querySelector('.splitter-layout')

describe('SplitterLayout panels', () => {
  // A fresh start opened a 50/50 split with an empty "No tabs open" half.
  it('shows one full-width panel while the right panel has no tabs', () => {
    seed([createTab('modelList')])
    render(<SplitterLayout />)

    expect(layout()).toHaveClass('splitter-layout--single')
    // Only the main dock carries the pinned entries.
    expect(screen.getByTestId('panel-left')).toHaveAttribute(
      'data-pinned',
      'yes'
    )
    expect(screen.getByTestId('panel-right')).toHaveAttribute(
      'data-pinned',
      'no'
    )
  })

  it('keeps a saved split with tabs on both sides', () => {
    seed([createTab('modelList'), right(createTab('settings'))])
    render(<SplitterLayout />)

    expect(layout()).not.toHaveClass('splitter-layout--single')
  })

  // Dragging a tab is how a split starts, so the hidden panel must appear as
  // a drop target for the length of the drag.
  it('shows the right panel as a drop target while a tab is dragged', () => {
    seed([createTab('modelList')])
    render(<SplitterLayout />)

    act(() => screen.getByText('drag-left').click())

    expect(layout()).not.toHaveClass('splitter-layout--single')
  })

  // Closing the last left tab used to leave an empty left half.
  it('collapses an empty left panel into one panel with the right tabs', () => {
    seed([right(createTab('settings'))])
    render(<SplitterLayout />)

    expect(layout()).toHaveClass('splitter-layout--single')
    expect(screen.getByTestId('panel-left')).toHaveAttribute(
      'data-tabs',
      'settings'
    )
    expect(screen.getByTestId('panel-right')).toHaveAttribute('data-tabs', '')
  })
})
