import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react'
import { useState } from 'react'

import { useListSelection } from '../useListSelection'

function useHarness(initialOrdered: string[], initialSelected: string[] = []) {
  const [orderedIds, setOrderedIds] = useState(initialOrdered)
  const [selectedIds, setSelectedIds] = useState(() => new Set(initialSelected))
  const selection = useListSelection({
    orderedIds,
    selectedIds,
    onChange: setSelectedIds,
  })
  return {
    orderedIds,
    setOrderedIds,
    selectedIds,
    setSelectedIds,
    ...selection,
  }
}

describe('useListSelection', () => {
  // Regression: every list used to carry its own selection code, so click,
  // shift-range and select-all drifted apart per page. This hook is the one
  // implementation all lists share.
  it('toggles a single id and keeps the rest untouched', () => {
    const { result } = renderHook(() => useHarness(['a', 'b', 'c']))

    act(() => result.current.toggle('b'))
    expect([...result.current.selectedIds]).toEqual(['b'])

    act(() => result.current.toggle('b'))
    expect([...result.current.selectedIds]).toEqual([])
  })

  it('shift+click adds the range from the last anchor and keeps other picks', () => {
    const { result } = renderHook(() => useHarness(['a', 'b', 'c', 'd']))

    act(() => result.current.toggle('b'))
    act(() => result.current.toggle('d', { shiftKey: true }))
    expect([...result.current.selectedIds]).toEqual(['b', 'c', 'd'])

    // The anchor stays put, so a second shift+click re-ranges from it.
    act(() => result.current.toggle('a', { shiftKey: true }))
    expect([...result.current.selectedIds].sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('shift+click without an anchor falls back to a plain toggle', () => {
    const { result } = renderHook(() => useHarness(['a', 'b', 'c']))

    act(() => result.current.toggle('c', { shiftKey: true }))
    expect([...result.current.selectedIds]).toEqual(['c'])
  })

  it('selects and deselects every visible id', () => {
    const { result } = renderHook(() => useHarness(['a', 'b', 'c']))

    act(() => result.current.selectAll())
    expect([...result.current.selectedIds].sort()).toEqual(['a', 'b', 'c'])

    act(() => result.current.deselectAll())
    expect([...result.current.selectedIds]).toEqual([])
  })

  it('Ctrl+A and Cmd+A select all visible ids and prevent the browser default', () => {
    const { result } = renderHook(() => useHarness(['a', 'b']))

    const ctrlEvent = {
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      key: 'a',
      preventDefault: jest.fn(),
    }
    act(() =>
      result.current.handleSelectAllKeyDown(
        ctrlEvent as unknown as KeyboardEvent
      )
    )
    expect(ctrlEvent.preventDefault).toHaveBeenCalled()
    expect([...result.current.selectedIds].sort()).toEqual(['a', 'b'])

    act(() => result.current.deselectAll())
    act(() =>
      result.current.handleSelectAllKeyDown({
        ctrlKey: false,
        metaKey: true,
        altKey: false,
        key: 'A',
        preventDefault: jest.fn(),
      } as unknown as KeyboardEvent)
    )
    expect([...result.current.selectedIds].sort()).toEqual(['a', 'b'])

    // A bare "a" keystroke must not hijack the list.
    act(() => result.current.deselectAll())
    act(() =>
      result.current.handleSelectAllKeyDown({
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        key: 'a',
        preventDefault: jest.fn(),
      } as unknown as KeyboardEvent)
    )
    expect([...result.current.selectedIds]).toEqual([])
  })

  // Regression: some lists kept ids that a search/filter had hidden, so a bulk
  // Recycle could hit invisible items. Every list now prunes to the visible set.
  it('prunes ids that are no longer visible', () => {
    const { result } = renderHook(() => useHarness(['a', 'b', 'c'], ['a', 'b']))

    act(() => result.current.setOrderedIds(['a', 'c']))
    expect([...result.current.selectedIds]).toEqual(['a'])

    act(() => result.current.setOrderedIds([]))
    expect([...result.current.selectedIds]).toEqual([])
  })

  it('can keep hidden ids selected when pruning is turned off', () => {
    const { result } = renderHook(() => {
      const [orderedIds, setOrderedIds] = useState(['a', 'b'])
      const [selectedIds, setSelectedIds] = useState(() => new Set(['b']))
      const selection = useListSelection({
        orderedIds,
        selectedIds,
        onChange: setSelectedIds,
        pruneToVisible: false,
      })
      return { setOrderedIds, selectedIds, ...selection }
    })

    act(() => result.current.setOrderedIds(['a']))
    expect([...result.current.selectedIds]).toEqual(['b'])
  })

  // Regression: Ctrl/Cmd+A was attached with onKeyDown to the grid container,
  // which is a plain div with no tabindex, so it never received the key. The
  // hook now owns the shortcut as a window listener (like every other app
  // shortcut), scoped to the mounted list and ignoring text fields.
  function ListHarness() {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    useListSelection({
      orderedIds: ['a', 'b', 'c'],
      selectedIds,
      onChange: setSelectedIds,
    })
    return <div data-testid="selected">{[...selectedIds].sort().join(',')}</div>
  }

  it('selects all on a real Ctrl+A with focus left on the page', () => {
    render(<ListHarness />)

    // The grid container is not focusable, so the user's focus stays on the
    // document body - exactly where the keystroke lands.
    fireEvent.keyDown(document.body, { key: 'a', ctrlKey: true })
    expect(screen.getByTestId('selected')).toHaveTextContent('a,b,c')
  })

  it('selects all on Cmd+A as well', () => {
    render(<ListHarness />)

    fireEvent.keyDown(document.body, { key: 'a', metaKey: true })
    expect(screen.getByTestId('selected')).toHaveTextContent('a,b,c')
  })

  it('never hijacks Ctrl+A while the user is typing in a field', () => {
    render(
      <>
        <ListHarness />
        <input aria-label="Search models" />
      </>
    )

    const input = screen.getByLabelText('Search models')
    input.focus()
    fireEvent.keyDown(input, { key: 'a', ctrlKey: true })

    expect(screen.getByTestId('selected')).toBeEmptyDOMElement()
  })

  // Regression: Ctrl/Cmd+A was a bare window listener, so a split dock with two
  // mounted lists selected in both. It is now scoped to the one list the user
  // last interacted with, via the container ref.
  function NamedList({ label }: { label: string }) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const selection = useListSelection({
      orderedIds: ['a', 'b', 'c'],
      selectedIds,
      onChange: setSelectedIds,
    })
    return (
      <div ref={selection.containerRef} data-testid={`list-${label}`}>
        <div data-testid={`selected-${label}`}>
          {[...selectedIds].sort().join(',')}
        </div>
      </div>
    )
  }

  it('selects only the last-clicked list when two lists are mounted', () => {
    render(
      <>
        <NamedList label="a" />
        <NamedList label="b" />
      </>
    )

    // Nothing was clicked yet: two mounted lists are ambiguous, so the shortcut
    // must not select in both.
    fireEvent.keyDown(document.body, { key: 'a', ctrlKey: true })
    expect(screen.getByTestId('selected-a')).toBeEmptyDOMElement()
    expect(screen.getByTestId('selected-b')).toBeEmptyDOMElement()

    // A pointer down inside list B makes it the target.
    fireEvent.pointerDown(screen.getByTestId('list-b'))
    fireEvent.keyDown(document.body, { key: 'a', ctrlKey: true })
    expect(screen.getByTestId('selected-a')).toBeEmptyDOMElement()
    expect(screen.getByTestId('selected-b')).toHaveTextContent('a,b,c')

    // The target follows the user.
    fireEvent.pointerDown(screen.getByTestId('list-a'))
    fireEvent.keyDown(document.body, { key: 'a', ctrlKey: true })
    expect(screen.getByTestId('selected-a')).toHaveTextContent('a,b,c')
    expect(screen.getByTestId('selected-b')).toHaveTextContent('a,b,c')
  })

  it('marks a list through focus inside its container', () => {
    render(
      <>
        <NamedList label="a" />
        <NamedList label="b" />
      </>
    )

    // Focus landing inside list B's container is the same signal as a click.
    fireEvent.focusIn(screen.getByTestId('list-b'))
    fireEvent.keyDown(document.body, { key: 'a', metaKey: true })

    expect(screen.getByTestId('selected-a')).toBeEmptyDOMElement()
    expect(screen.getByTestId('selected-b')).toHaveTextContent('a,b,c')
  })
})
