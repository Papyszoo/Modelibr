import { renderHook } from '@testing-library/react'

import { useTabMenuItems } from '@/hooks/useTabMenuItems'
import { type Tab } from '@/types'

describe('useTabMenuItems', () => {
  it('groups recently closed tabs under a reopen submenu', () => {
    const onAddTab = jest.fn()
    const onReopenTab = jest.fn()
    const recentlyClosedTabs: Tab[] = [
      {
        id: 'closed-models',
        type: 'modelList',
        label: 'Models',
        params: {},
        internalUiState: {},
      },
      {
        id: 'closed-project',
        type: 'projects',
        label: 'Project Atlas',
        params: {},
        internalUiState: {},
      },
    ]

    const { result } = renderHook(() =>
      useTabMenuItems({ onAddTab, recentlyClosedTabs, onReopenTab })
    )

    const reopenItem = result.current.find(item => item.label === 'Reopen')

    expect(reopenItem).toBeDefined()
    expect(reopenItem?.items).toHaveLength(2)
    expect(reopenItem?.items?.map(item => item.label)).toEqual([
      'Models',
      'Project Atlas',
    ])

    reopenItem?.items?.[1].command?.({} as never)

    expect(onReopenTab).toHaveBeenCalledWith(recentlyClosedTabs[1])
  })
})
