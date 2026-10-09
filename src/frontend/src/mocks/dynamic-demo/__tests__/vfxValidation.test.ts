import { validateDefinition } from '../vfxValidation'

const particles = (extra: Record<string, unknown> = {}) => ({
  id: 'particles-1',
  type: 'particles',
  name: 'Pool',
  start: 0,
  duration: 1,
  particles: { mode: 'continuous', seed: 1, ...extra },
})

const definition = (components: unknown[]) => ({
  version: 1,
  duration: 2,
  loop: false,
  components,
})

describe('demo vfx validation of ground shapes', () => {
  // Regression: the demo mirror rejected the radius track on a disc emitter or a
  // primitive mesh that the real server accepts, so a ground puddle saved fine on
  // the server but showed "not valid" in demo mode only.
  it('accepts a radius track on a disc emitter', () => {
    const component = {
      ...particles(),
      emitter: { shape: 'disc', radius: 3 },
      tracks: { radius: [[0, 3]] },
    }

    expect(validateDefinition(definition([component]))).toEqual([])
  })

  it('still rejects the radius track on a point emitter', () => {
    const component = {
      ...particles(),
      emitter: { shape: 'point' },
      tracks: { radius: [[0, 3]] },
    }

    const problems = validateDefinition(definition([component]))

    expect(problems.map(problem => problem.path)).toContain(
      'components[0].tracks.radius'
    )
  })

  it('accepts a primitive mesh with a radius track and no model', () => {
    const component = {
      id: 'mesh-1',
      type: 'mesh',
      name: 'Puddle',
      start: 0,
      duration: 1,
      mesh: { kind: 'disc', radius: 4 },
      tracks: { radius: [[0, 4]] },
    }

    expect(validateDefinition(definition([component]))).toEqual([])
  })

  it('still rejects the radius track on a library mesh', () => {
    const component = {
      id: 'mesh-1',
      type: 'mesh',
      name: 'Crate',
      start: 0,
      duration: 1,
      mesh: { modelId: 1 },
      tracks: { radius: [[0, 4]] },
    }

    const problems = validateDefinition(definition([component]))

    expect(problems.map(problem => problem.path)).toContain(
      'components[0].tracks.radius'
    )
  })
})

describe('demo vfx validation of primitive colour', () => {
  const primitive = (mesh: Record<string, unknown>) => ({
    id: 'mesh-1',
    type: 'mesh',
    name: 'Puddle',
    start: 0,
    duration: 1,
    mesh: { kind: 'disc', radius: 2, ...mesh },
  })

  it('accepts a primitive colour and emissive intensity', () => {
    expect(
      validateDefinition(
        definition([primitive({ color: '#5aa469', emissiveIntensity: 4 })])
      )
    ).toEqual([])
  })

  it('rejects a malformed colour and an out-of-range emissive', () => {
    const problems = validateDefinition(
      definition([primitive({ color: 'green', emissiveIntensity: 12 })])
    )
    const paths = problems.map(problem => problem.path)

    expect(paths).toContain('components[0].mesh.color')
    expect(paths).toContain('components[0].mesh.emissiveIntensity')
  })
})
