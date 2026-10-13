import { fireEvent, render, screen } from '@testing-library/react'

import { ListSelectionBar } from '../ListToolbar'

const noop = () => {}

describe('ListSelectionBar', () => {
  // Regression: each list assembled its own selection bar, so the same state
  // showed "Clear" here, "Deselect All" there and no Select All at all in
  // sounds/sprites. This component is the one composition every list renders.
  it('renders the count summary with correct pluralization', () => {
    const { rerender } = render(
      <ListSelectionBar
        count={1}
        visibleCount={5}
        unitLabel="model"
        onSelectAllClick={noop}
        onDeselectAllClick={noop}
      />
    )
    expect(screen.getByTestId('selection-count')).toHaveTextContent(
      '1 model selected.'
    )

    rerender(
      <ListSelectionBar
        count={3}
        visibleCount={5}
        unitLabel="model"
        onSelectAllClick={noop}
        onDeselectAllClick={noop}
      />
    )
    expect(screen.getByTestId('selection-count')).toHaveTextContent(
      '3 models selected.'
    )
  })

  it('renders nothing when nothing is selected', () => {
    render(
      <ListSelectionBar
        count={0}
        visibleCount={5}
        unitLabel="sound"
        onSelectAllClick={noop}
        onDeselectAllClick={noop}
      />
    )
    expect(screen.queryByTestId('selection-bar')).not.toBeInTheDocument()
  })

  it('disables Select All once every visible item is selected', () => {
    const { rerender } = render(
      <ListSelectionBar
        count={2}
        visibleCount={5}
        unitLabel="sprite"
        onSelectAllClick={noop}
        onDeselectAllClick={noop}
      />
    )
    expect(screen.getByRole('button', { name: 'Select All' })).toBeEnabled()

    rerender(
      <ListSelectionBar
        count={5}
        visibleCount={5}
        unitLabel="sprite"
        onSelectAllClick={noop}
        onDeselectAllClick={noop}
      />
    )
    expect(screen.getByRole('button', { name: 'Select All' })).toBeDisabled()
  })

  it('wires Select All / Deselect All / Bulk actions to their handlers', () => {
    const onSelectAllClick = jest.fn()
    const onDeselectAllClick = jest.fn()
    const onBulkActionsClick = jest.fn()

    render(
      <ListSelectionBar
        count={2}
        visibleCount={5}
        unitLabel="map"
        onBulkActionsClick={onBulkActionsClick}
        onSelectAllClick={onSelectAllClick}
        onDeselectAllClick={onDeselectAllClick}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Bulk actions for 2 maps' })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Select All' }))
    fireEvent.click(screen.getByRole('button', { name: 'Deselect All' }))

    expect(onBulkActionsClick).toHaveBeenCalledTimes(1)
    expect(onSelectAllClick).toHaveBeenCalledTimes(1)
    expect(onDeselectAllClick).toHaveBeenCalledTimes(1)
  })

  it('omits the Bulk actions button when the list has no bulk menu', () => {
    render(
      <ListSelectionBar
        count={1}
        visibleCount={2}
        unitLabel="pack"
        onSelectAllClick={noop}
        onDeselectAllClick={noop}
      />
    )
    expect(
      screen.queryByRole('button', { name: /Bulk actions/ })
    ).not.toBeInTheDocument()
  })

  // Regression: the context menu is positioned from the event's pageX/pageY. A
  // keyboard activation (Enter/Space on the button) fires a click at 0,0, which
  // dropped the bulk menu in the window's top-left corner instead of under the
  // button.
  it('anchors a keyboard activation of Bulk actions on the button', () => {
    const onBulkActionsClick = jest.fn()

    render(
      <ListSelectionBar
        count={2}
        visibleCount={5}
        unitLabel="map"
        onBulkActionsClick={onBulkActionsClick}
        onSelectAllClick={noop}
        onDeselectAllClick={noop}
      />
    )

    const button = screen.getByRole('button', {
      name: 'Bulk actions for 2 maps',
    })
    button.getBoundingClientRect = () => ({ left: 300, bottom: 120 }) as DOMRect

    fireEvent.click(button, { pageX: 0, pageY: 0 })

    const event = onBulkActionsClick.mock.calls[0][0]
    expect(event.pageX).toBe(300)
    expect(event.pageY).toBe(120)
  })

  it('leaves a pointer click anchored where the pointer clicked', () => {
    const onBulkActionsClick = jest.fn()

    render(
      <ListSelectionBar
        count={2}
        visibleCount={5}
        unitLabel="map"
        onBulkActionsClick={onBulkActionsClick}
        onSelectAllClick={noop}
        onDeselectAllClick={noop}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Bulk actions for 2 maps' }),
      // jsdom derives pageX/pageY from clientX/clientY (scroll is 0).
      { clientX: 640, clientY: 40 }
    )

    const event = onBulkActionsClick.mock.calls[0][0]
    expect(event.pageX).toBe(640)
    expect(event.pageY).toBe(40)
  })
})
