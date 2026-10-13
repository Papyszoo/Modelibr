import { fireEvent, render, screen } from '@testing-library/react'

import { useGridAreaSelection } from '../useGridAreaSelection'

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

function rect(left: number, top: number, width: number, height: number): Rect {
  return { left, top, width, height }
}

function stubRect(element: HTMLElement, r: Rect) {
  element.getBoundingClientRect = () =>
    ({
      ...r,
      right: r.left + r.width,
      bottom: r.top + r.height,
      x: r.left,
      y: r.top,
      toJSON: () => ({}),
    }) as DOMRect
}

function Harness({
  onSelect,
  enabled = true,
}: {
  onSelect: (ids: Set<string>) => void
  enabled?: boolean
}) {
  const { surfaceRef, isAreaSelecting, selectionBox, surfaceProps } =
    useGridAreaSelection<string>({
      enabled,
      cardSelector: '.card[data-card-id]',
      getCardId: card => card.getAttribute('data-card-id'),
      onSelect,
    })

  return (
    <div ref={surfaceRef} data-testid="surface" {...surfaceProps}>
      <div className="card" data-card-id="a" data-testid="card-a" />
      <div className="card" data-card-id="b" data-testid="card-b" />
      <div className="card" data-card-id="c" data-testid="card-c" />
      <span data-testid="selecting">{String(isAreaSelecting)}</span>
      <span data-testid="box">
        {selectionBox
          ? `${selectionBox.startX},${selectionBox.startY}`
          : 'none'}
      </span>
    </div>
  )
}

function stubGridLayout(scrollLeft = 0, scrollTop = 0) {
  const surface = screen.getByTestId('surface')
  stubRect(surface, rect(0, 0, 400, 300))
  surface.scrollLeft = scrollLeft
  surface.scrollTop = scrollTop
  stubRect(screen.getByTestId('card-a'), rect(10, 10, 50, 50))
  stubRect(screen.getByTestId('card-b'), rect(100, 10, 50, 50))
  stubRect(screen.getByTestId('card-c'), rect(10, 100, 50, 50))
  return surface
}

describe('useGridAreaSelection', () => {
  // Regression: the lasso existed once per grid, so each copy had its own
  // coordinate handling (two of them forgot the scroll offset). One hook now
  // drives every grid.
  it('selects every card the dragged rectangle touches', () => {
    const onSelect = jest.fn()
    render(<Harness onSelect={onSelect} />)
    const surface = stubGridLayout()

    fireEvent.mouseDown(surface, { button: 0, clientX: 5, clientY: 5 })
    expect(screen.getByTestId('selecting')).toHaveTextContent('true')

    fireEvent.mouseMove(surface, { clientX: 160, clientY: 60 })
    fireEvent.mouseUp(surface)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect([...onSelect.mock.calls[0][0]].sort()).toEqual(['a', 'b'])
    expect(screen.getByTestId('selecting')).toHaveTextContent('false')
  })

  it('does not start a lasso on a card, a non-primary button or when disabled', () => {
    const onSelect = jest.fn()
    const { rerender } = render(<Harness onSelect={onSelect} />)
    const surface = stubGridLayout()

    fireEvent.mouseDown(screen.getByTestId('card-a'), {
      button: 0,
      clientX: 15,
      clientY: 15,
    })
    expect(screen.getByTestId('selecting')).toHaveTextContent('false')

    fireEvent.mouseDown(surface, { button: 2, clientX: 5, clientY: 5 })
    expect(screen.getByTestId('selecting')).toHaveTextContent('false')

    rerender(<Harness onSelect={onSelect} enabled={false} />)
    const disabledSurface = stubGridLayout()
    fireEvent.mouseDown(disabledSurface, { button: 0, clientX: 5, clientY: 5 })
    fireEvent.mouseMove(disabledSurface, { clientX: 160, clientY: 60 })
    fireEvent.mouseUp(disabledSurface)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('keeps the existing selection when the rectangle touches nothing', () => {
    const onSelect = jest.fn()
    render(<Harness onSelect={onSelect} />)
    const surface = stubGridLayout()

    fireEvent.mouseDown(surface, { button: 0, clientX: 300, clientY: 200 })
    fireEvent.mouseMove(surface, { clientX: 380, clientY: 280 })
    fireEvent.mouseUp(surface)

    expect(onSelect).not.toHaveBeenCalled()
  })

  // The box is drawn inside a surface that may scroll itself (sounds, sprites):
  // its coordinates must be content-space, so the scroll offset is part of the
  // start point.
  it('records the drag start in the surface content space', () => {
    const onSelect = jest.fn()
    render(<Harness onSelect={onSelect} />)
    const surface = stubGridLayout(120, 40)

    fireEvent.mouseDown(surface, { button: 0, clientX: 5, clientY: 7 })
    expect(screen.getByTestId('box')).toHaveTextContent('125,47')
  })
})
