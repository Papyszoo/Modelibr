import { act, renderHook } from '@testing-library/react'

import { useMediaQuery } from '../useMediaQuery'

type Listener = (event: MediaQueryListEvent) => void

interface MockMql {
  matches: boolean
  media: string
  listeners: Set<Listener>
  addEventListener: jest.Mock
  removeEventListener: jest.Mock
  onchange: null
  addListener: jest.Mock
  removeListener: jest.Mock
  dispatchEvent: jest.Mock
}

function makeMockMatchMedia(initial: boolean) {
  const created: MockMql[] = []
  const matchMedia = jest.fn().mockImplementation((query: string) => {
    const mql: MockMql = {
      matches: initial,
      media: query,
      listeners: new Set(),
      onchange: null,
      addEventListener: jest.fn((_event: string, cb: Listener) => {
        mql.listeners.add(cb)
      }),
      removeEventListener: jest.fn((_event: string, cb: Listener) => {
        mql.listeners.delete(cb)
      }),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }
    created.push(mql)
    return mql
  })
  return { matchMedia, created }
}

describe('useMediaQuery', () => {
  const originalMatchMedia = window.matchMedia

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: originalMatchMedia,
    })
  })

  it('returns initial match value', () => {
    const { matchMedia } = makeMockMatchMedia(true)
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMedia,
    })

    const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'))
    expect(result.current).toBe(true)
  })

  it('updates when the media query changes', () => {
    const { matchMedia, created } = makeMockMatchMedia(false)
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMedia,
    })

    const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'))
    expect(result.current).toBe(false)

    // The hook calls matchMedia once for the initial state and once inside
    // the effect — only the effect's MQL has a listener attached.
    const subscribed = created.find(mql => mql.listeners.size > 0)
    expect(subscribed).toBeDefined()

    act(() => {
      subscribed!.matches = true
      subscribed!.listeners.forEach(cb =>
        cb({
          matches: true,
          media: subscribed!.media,
        } as MediaQueryListEvent)
      )
    })

    expect(result.current).toBe(true)
  })

  it('cleans up the listener on unmount', () => {
    const { matchMedia, created } = makeMockMatchMedia(false)
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMedia,
    })

    const { unmount } = renderHook(() => useMediaQuery('(max-width: 767px)'))
    const subscribed = created.find(mql => mql.addEventListener.mock.calls.length > 0)
    expect(subscribed).toBeDefined()

    unmount()

    expect(subscribed!.removeEventListener).toHaveBeenCalledTimes(1)
  })
})
