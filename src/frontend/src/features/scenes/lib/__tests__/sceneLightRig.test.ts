import type { SceneLight } from '../../types'
import { needsAmbientFill } from '../sceneLightRig'

/**
 * The ambient fill the viewport adds on top of the document's lights.
 *
 * The regression this guards: the fill was dropped at the first authored
 * light, so clicking "Light" in the editor - which adds only a directional key
 * light - removed the ambient fill as well, and the scene got darker the
 * moment it was lit.
 */
describe('needsAmbientFill', () => {
  function light(overrides: Partial<SceneLight>): SceneLight {
    return {
      id: 'light-1',
      type: 'directional',
      position: { x: 0, y: 0, z: 0 },
      intensity: 1,
      color: '#ffffff',
      ...overrides,
    }
  }

  it('fills a scene with no lights at all', () => {
    expect(needsAmbientFill([])).toBe(true)
  })

  it('keeps filling when the only lights are key lights', () => {
    expect(
      needsAmbientFill([
        light({ id: 'key', type: 'directional' }),
        light({ id: 'lamp', type: 'point' }),
      ])
    ).toBe(true)
  })

  it('stops filling when the document authors an ambient light', () => {
    // An authored ambient IS the scene's answer for its own fill, and stacking
    // the default on top of it would ignore what the document says.
    expect(
      needsAmbientFill([
        light({ id: 'fill', type: 'ambient', intensity: 0.2 }),
        light({ id: 'key' }),
      ])
    ).toBe(false)
  })
})
