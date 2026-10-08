import { screen } from '@testing-library/react'

import { renderWithProviders } from '@/test/renderWithProviders'

import * as vfxApi from '../../api/vfxApi'
import { fitComponents, VfxEditor } from '../VfxEditor'

/*
  The 3D preview cannot draw in jsdom, so the canvas is stubbed. Everything
  else - the inspector, the timeline, the query and the toolbar - is real.
*/
jest.mock('../VfxPreview', () => ({
  VfxPreview: () => <div data-testid="vfx-preview" />,
}))

jest.mock('../../api/vfxApi')

const vfx = vfxApi as jest.Mocked<typeof vfxApi>

const detail = {
  id: 1,
  name: 'Spark fountain',
  description: null,
  definition: {
    version: 1 as const,
    duration: 2,
    loop: false,
    components: [
      {
        id: 'particles-1',
        type: 'particles' as const,
        name: 'Sparks',
        start: 0,
        duration: 1,
        particles: {
          mode: 'continuous' as const,
          rate: 60,
          count: 100,
          lifetime: 1,
          speed: 2,
          spread: 25,
          gravity: -2,
          sizeStart: 0.15,
          sizeEnd: 0,
          colorStart: '#ffd27a',
          colorEnd: '#ff4a1c',
          opacityStart: 1,
          opacityEnd: 0,
          blending: 'additive' as const,
          spriteId: null,
          seed: 7,
        },
      },
      {
        id: 'light-1',
        type: 'light' as const,
        name: 'Glow',
        start: 0.5,
        duration: 1,
        position: [0, 0, 0] as [number, number, number],
        light: { color: '#ffb466', range: 6 },
        tracks: {
          intensity: [
            [0, 0],
            [1, 4],
          ] as [number, number][],
        },
      },
    ],
  },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

describe('VfxEditor', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    vfx.getVfx.mockResolvedValue(detail as never)
    vfx.updateVfx.mockResolvedValue(detail as never)
  })

  it('loads the effect into the toolbar, preview and timeline', async () => {
    renderWithProviders(<VfxEditor vfxId={1} />)

    expect(await screen.findByTestId('vfx-editor')).toBeInTheDocument()
    expect(screen.getByLabelText('Effect name')).toHaveValue('Spark fountain')
    expect(screen.getByTestId('vfx-preview')).toBeInTheDocument()
    expect(screen.getAllByTestId('vfx-timeline-track')).toHaveLength(2)
  })
})

describe('fitComponents', () => {
  const component = (
    start: number,
    duration: number
  ): Parameters<typeof fitComponents>[0][number] => ({
    id: 'light-1',
    type: 'light',
    name: 'Glow',
    start,
    duration,
    light: { color: '#ffb466', range: 6 },
  })

  it('shrinks and slides components so none runs past the effect', () => {
    // The regression: shortening the effect left components hanging outside
    // it, which the server rejects on the next save.
    const [fitted] = fitComponents([component(1.5, 1)], 2)

    expect(fitted.duration).toBeLessThanOrEqual(2)
    expect(fitted.start + fitted.duration).toBeLessThanOrEqual(2)
  })

  it('leaves a component that already fits untouched', () => {
    const inside = component(0, 1)

    expect(fitComponents([inside], 5)[0]).toBe(inside)
  })
})
