import { fireEvent, render, screen } from '@testing-library/react'

import type { VfxDefinition } from '../../types'
import { VfxTimeline } from '../VfxTimeline'

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
})
