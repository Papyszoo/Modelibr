import { fireEvent, render, screen } from '@testing-library/react'

import { AssetTile } from '../AssetTile'

/**
 * AssetTile is the primitive behind every asset grid (models, textures, sounds,
 * sprites, env maps, store packs), so "can you open a tile without a mouse" is
 * answered here once for all of them.
 */
describe('AssetTile', () => {
  const media = <div data-testid="media" />

  // Regression: the tile was a bare <div> with onClick — no role, no tabIndex, no
  // key handling — so every grid in the app was mouse-only.
  it('is a focusable button when it is clickable', () => {
    render(<AssetTile media={media} name="Chair" onClick={jest.fn()} />)

    const tile = screen.getByRole('button', { name: /chair/i })
    expect(tile).toHaveAttribute('tabindex', '0')
  })

  it.each(['Enter', ' '])('activates on %s', key => {
    const onClick = jest.fn()
    render(<AssetTile media={media} name="Chair" onClick={onClick} />)

    fireEvent.keyDown(screen.getByRole('button'), { key })

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('ignores other keys', () => {
    const onClick = jest.fn()
    render(<AssetTile media={media} name="Chair" onClick={onClick} />)

    fireEvent.keyDown(screen.getByRole('button'), { key: 'a' })
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Tab' })

    expect(onClick).not.toHaveBeenCalled()
  })

  // A non-clickable tile must not become an empty tab stop — some grids render
  // purely presentational tiles.
  it('stays inert when there is no onClick', () => {
    render(<AssetTile media={media} name="Chair" />)

    expect(screen.queryByRole('button')).toBeNull()
    expect(
      screen.getByText('Chair').closest('.asset-tile')
    ).not.toHaveAttribute('tabindex')
  })

  // Space scrolls the page on a non-<button> element unless the handler prevents it.
  it('prevents the default page scroll on Space', () => {
    render(<AssetTile media={media} name="Chair" onClick={jest.fn()} />)

    const event = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    })
    screen.getByRole('button').dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  // The checkbox slot holds a readOnly indicator, not a control — a key press
  // bubbling out of anything the caller nests must not double-fire the tile.
  it('ignores key events bubbling from nested content', () => {
    const onClick = jest.fn()
    render(
      <AssetTile
        media={media}
        name="Chair"
        onClick={onClick}
        checkbox={<input data-testid="nested" />}
      />
    )

    fireEvent.keyDown(screen.getByTestId('nested'), { key: 'Enter' })

    expect(onClick).not.toHaveBeenCalled()
  })
})
