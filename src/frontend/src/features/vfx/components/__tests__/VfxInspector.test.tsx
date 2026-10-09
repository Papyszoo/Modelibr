import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import { renderWithProviders } from '@/test/renderWithProviders'

import type { VfxComponent } from '../../types'
import { VfxInspector } from '../VfxInspector'

/*
  The inspector is where a ground effect is authored: the emitter shape, the
  flat primitive and the radius track. These tests drive the real controls and
  assert the component they produce, so a select that renders but does not
  round-trip its value is caught.
*/
function Harness({ initial }: { initial: VfxComponent }) {
  const [component, setComponent] = useState(initial)
  return (
    <VfxInspector
      component={component}
      effectDuration={4}
      time={0}
      problems={[]}
      onChange={setComponent}
      onDelete={() => undefined}
    />
  )
}

const particlesComponent = (
  overrides: Partial<VfxComponent> = {}
): VfxComponent => ({
  id: 'particles-1',
  type: 'particles',
  name: 'Pool',
  start: 0,
  duration: 1,
  position: [0, 0, 0],
  particles: {
    mode: 'continuous',
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
    blending: 'additive',
    spriteId: null,
    seed: 7,
  },
  ...overrides,
})

const meshComponent = (
  overrides: Partial<VfxComponent> = {}
): VfxComponent => ({
  id: 'mesh-1',
  type: 'mesh',
  name: 'Puddle',
  start: 0,
  duration: 1,
  position: [0, 0, 0],
  mesh: { modelId: 5, versionId: null },
  ...overrides,
})

describe('VfxInspector particles emitter', () => {
  // Regression: a plain particles component has no emitter field, and the
  // select must fall back to point without inventing a radius.
  it('shows a point emitter by default and no radius inputs', () => {
    renderWithProviders(<Harness initial={particlesComponent()} />)

    expect(screen.getByLabelText('Emitter shape')).toHaveValue('point')
    expect(screen.queryByLabelText('Radius (m)')).not.toBeInTheDocument()
    expect(screen.queryByTestId('vfx-track-radius')).not.toBeInTheDocument()
  })

  it('shows and round-trips a disc radius', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Harness initial={particlesComponent()} />)

    await user.selectOptions(screen.getByLabelText('Emitter shape'), 'disc')
    expect(screen.getByLabelText('Radius (m)')).toHaveValue(2)

    fireEvent.change(screen.getByLabelText('Radius (m)'), {
      target: { value: '5' },
    })

    expect(screen.getByLabelText('Radius (m)')).toHaveValue(5)
  })

  it('shows both radii for a ring', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Harness initial={particlesComponent()} />)

    await user.selectOptions(screen.getByLabelText('Emitter shape'), 'ring')

    expect(screen.getByLabelText('Inner radius (m)')).toHaveValue(1)
    expect(screen.getByLabelText('Outer radius (m)')).toHaveValue(3)
  })

  it('exposes the radius track only for a disc or ring, and drops it for a point', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <Harness
        initial={particlesComponent({
          emitter: { shape: 'disc', radius: 3 },
          tracks: { radius: [[0, 3]] },
        })}
      />
    )

    expect(screen.getByTestId('vfx-track-radius')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Emitter shape'), 'point')

    expect(screen.queryByTestId('vfx-track-radius')).not.toBeInTheDocument()
  })

  // The emitter lives on the component, as the server and Godot store it; the
  // inspector used to read it from inside `particles` and showed "Point".
  it('shows Disc for a component-level emitter the backend stores', () => {
    renderWithProviders(
      <Harness
        initial={particlesComponent({
          emitter: { shape: 'disc', radius: 1.5 },
          tracks: { radius: [[0, 1.5]] },
        })}
      />
    )

    expect(screen.getByLabelText('Emitter shape')).toHaveValue('disc')
    expect(screen.getByLabelText('Radius (m)')).toHaveValue(1.5)
    expect(screen.getByTestId('vfx-track-radius')).toBeInTheDocument()
  })
})

describe('VfxInspector mesh primitives', () => {
  it('renders a plain library mesh exactly as before', () => {
    renderWithProviders(<Harness initial={meshComponent()} />)

    expect(screen.getByLabelText('Primitive')).toHaveValue('model')
    expect(screen.getByTestId('vfx-asset-model')).toBeInTheDocument()
    expect(screen.queryByLabelText('Radius (m)')).not.toBeInTheDocument()
    expect(screen.queryByTestId('vfx-track-radius')).not.toBeInTheDocument()
  })

  it('round-trips a disc radius and its track', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Harness initial={meshComponent()} />)

    await user.selectOptions(screen.getByLabelText('Primitive'), 'disc')
    expect(screen.getByLabelText('Radius (m)')).toHaveValue(3)
    expect(screen.getByTestId('vfx-track-radius')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Radius (m)'), {
      target: { value: '6' },
    })
    expect(screen.getByLabelText('Radius (m)')).toHaveValue(6)
  })

  it('shows both radii for a ring primitive', () => {
    renderWithProviders(
      <Harness
        initial={meshComponent({
          mesh: { kind: 'ring', innerRadius: 2, outerRadius: 5 },
        })}
      />
    )

    expect(screen.getByLabelText('Inner radius (m)')).toHaveValue(2)
    expect(screen.getByLabelText('Outer radius (m)')).toHaveValue(5)
  })

  it('drops the radius track when a primitive becomes a library mesh', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <Harness
        initial={meshComponent({
          mesh: { kind: 'disc', radius: 4 },
          tracks: { radius: [[0, 4]] },
        })}
      />
    )

    expect(screen.getByTestId('vfx-track-radius')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Primitive'), 'model')

    expect(screen.queryByTestId('vfx-track-radius')).not.toBeInTheDocument()
    expect(screen.getByTestId('vfx-asset-model')).toBeInTheDocument()
  })

  // Section 7: a primitive carries its own colour and glow, defaulting to the
  // grey an old definition renders as.
  it('defaults a primitive to the grey, then round-trips colour and emissive', () => {
    renderWithProviders(
      <Harness initial={meshComponent({ mesh: { kind: 'disc', radius: 2 } })} />
    )

    expect(screen.getByLabelText('Colour')).toHaveValue('#8a93a6')
    expect(screen.getByLabelText('Emissive')).toHaveValue(0)

    fireEvent.change(screen.getByLabelText('Colour'), {
      target: { value: '#5aa469' },
    })
    fireEvent.change(screen.getByLabelText('Emissive'), {
      target: { value: '4' },
    })

    expect(screen.getByLabelText('Colour')).toHaveValue('#5aa469')
    expect(screen.getByLabelText('Emissive')).toHaveValue(4)
  })
})
