import {
  DRIVER_INPUTS,
  EFFECT_PARAM_RANGES,
  type MaterialEffectType,
} from '@/shared/three/materialEffects'

import {
  defaultDriverScale,
  EFFECT_SPECS,
  previewFitDistance,
} from '../materialEffectAuthoring'

describe('materialEffectAuthoring', () => {
  it('presents exactly the runtime range for every slider', () => {
    // Regression: the editor used to carry its own copies of the param ranges.
    // If they drift from the parser/driver table, a slider can emit a value the
    // document parser rejects - this asserts the single source holds.
    for (const [type, spec] of Object.entries(EFFECT_SPECS)) {
      for (const param of spec.params) {
        const [min, max] =
          EFFECT_PARAM_RANGES[type as MaterialEffectType][param.key]
        expect({ min: param.min, max: param.max }).toEqual({ min, max })
      }
    }
  })

  it('keeps the driver input list aligned with the runtime', () => {
    expect(DRIVER_INPUTS).toEqual(['speed', 'impulse', 'charge'])
  })

  it('backs the preview camera off only by the jelly wobble', () => {
    // Regression: the camera distance must grow with the wobble (base amplitude
    // and driver contribution), or the enlarged sphere clips the frame.
    const inputs = { speed: 0, impulse: 0, charge: 0 }
    const base = previewFitDistance([], inputs)
    expect(base).toBeCloseTo((1 / Math.tan((35 * Math.PI) / 360)) * 1.08)

    const wobbling = previewFitDistance(
      [
        {
          type: 'jelly_wobble',
          amplitude: 0.3,
          frequency: 1,
          waveScale: 1,
          seed: 0,
        },
      ],
      inputs
    )
    expect(wobbling).toBeGreaterThan(base)

    const driven = previewFitDistance(
      [
        {
          type: 'jelly_wobble',
          amplitude: 0.03,
          frequency: 1,
          waveScale: 1,
          seed: 0,
          drivers: { amplitude: { input: 'speed', scale: 0.02 } },
        },
      ],
      { speed: 20, impulse: 0, charge: 0 }
    )
    expect(driven).toBeGreaterThan(base)
  })

  it('defaults a driver scale that moves the param about half its range', () => {
    // Regression: a zero default made a freshly bound driver look dead. The
    // scale is (max - min) * 0.5 / inputMax, rounded to 3 significant digits.
    expect(defaultDriverScale(0, 0.5, 'speed')).toBeCloseTo(0.0125)
    expect(defaultDriverScale(0.5, 8, 'speed')).toBeCloseTo(0.188)
    expect(defaultDriverScale(0, 10, 'impulse')).toBeCloseTo(5)
    expect(defaultDriverScale(0, 1, 'charge')).toBeCloseTo(0.5)
  })
})
