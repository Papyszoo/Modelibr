import { fireEvent, render, screen } from '@testing-library/react'

import type { VfxDefinition } from '../../types'
import { labelStride, VfxTimeline } from '../VfxTimeline'

const definition: VfxDefinition = {
  version: 1,
  duration: 2,
  loop: false,
  components: [
    {
      id: 'particles-1',
      type: 'particles',
      name: 'Sparks',
      start: 0,
      duration: 1,
      particles: undefined,
    },
    {
      id: 'light-1',
      type: 'light',
      name: 'Glow',
      start: 0.5,
      duration: 1,
      light: { color: '#ffb466', range: 6 },
    },
    {
      id: 'sound-1',
      type: 'sound',
      name: 'Crackle',
      start: 0,
      duration: 2,
      sound: { soundId: 1, volume: 1 },
    },
  ],
}

function renderTimeline(onSeek: (time: number) => void) {
  return render(
    <VfxTimeline
      definition={definition}
      time={0}
      selectedId={null}
      onSelect={jest.fn()}
      onSeek={onSeek}
      onChangeTiming={jest.fn()}
    />
  )
}

describe('VfxTimeline', () => {
  beforeAll(() => {
    // jsdom does not implement pointer capture; the drag handlers call it.
    Element.prototype.setPointerCapture = jest.fn()
    Element.prototype.releasePointerCapture = jest.fn()
  })

  it('renders one track per component', () => {
    renderTimeline(jest.fn())

    expect(screen.getAllByTestId('vfx-timeline-track')).toHaveLength(
      definition.components.length
    )
  })

  it('seeks to the time under the ruler when it is clicked', () => {
    const onSeek = jest.fn()
    renderTimeline(onSeek)

    const ruler = screen.getByTestId('vfx-timeline-ruler')
    // A 2-second effect laid across 200px starting at x=100: a click at x=150
    // is exactly 0.5s in.
    jest.spyOn(ruler, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 0,
      right: 300,
      bottom: 20,
      width: 200,
      height: 20,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect)

    fireEvent(
      ruler,
      new MouseEvent('pointerdown', { clientX: 150, bubbles: true })
    )

    expect(onSeek).toHaveBeenCalledWith(0.5)
  })

  it('thins the tick labels when the ruler is too narrow for one per tick', () => {
    // A 100px ruler piling 9 ticks (a 2s effect, 0.25s apart) leaves ~12px per
    // label, so every third one is drawn: 0, 0.75, 1.5.
    const width = jest
      .spyOn(Element.prototype, 'clientWidth', 'get')
      .mockReturnValue(100)
    try {
      renderTimeline(jest.fn())

      const labels = screen
        .getAllByTestId('vfx-timeline-tick')
        .map(tick => tick.textContent)
        .filter(Boolean)

      expect(labels).toEqual(['0', '0.75', '1.5'])
    } finally {
      width.mockRestore()
    }
  })
})

describe('labelStride', () => {
  it('keeps every label when the ruler has room', () => {
    expect(labelStride(5, 400)).toBe(1)
    expect(labelStride(4, 100)).toBe(1)
  })

  it('thins labels as the ruler narrows so they never overlap', () => {
    // 13 ticks ~16px apart on a phone: a ~32px label needs every other one.
    expect(labelStride(13, 194)).toBe(2)
  })

  it('never goes below one label, even unmeasured', () => {
    expect(labelStride(1, 10)).toBe(1)
    expect(labelStride(5, 0)).toBe(1)
  })
})
