import {
  EFFECT_PARAM_RANGES,
  INPUT_RANGES,
  type MaterialEffect,
  type MaterialEffectInputName,
  type MaterialEffectInputs,
  type MaterialEffectType,
} from '@/shared/three/materialEffects'

/**
 * Authoring metadata for the effects editor.
 *
 * The runtime lives in `@/shared/three/materialEffects` and is the single
 * source of truth for ranges and driver rules; this module only describes how
 * to present them. Every range here reads from that file's `EFFECT_PARAM_RANGES`
 * (the same table the parser validates against), so a value the sliders can
 * produce is a value the document parser accepts.
 */

export interface EffectParamSpec {
  key: string
  label: string
  /** One-line explanation shown under the slider, when the param needs it. */
  hint?: string
  min: number
  max: number
  step: number
  /** Seed is an integer counter, never a smoothed value. */
  integer?: boolean
  /** Drivers only exist for the params the runtime lists as drivable. */
  drivable: boolean
}

export interface EffectColorSpec {
  key: string
  label: string
}

export interface EffectSpec {
  label: string
  color?: EffectColorSpec
  params: EffectParamSpec[]
}

// Read once so the slider ranges below are visibly the runtime's ranges.
const JELLY = EFFECT_PARAM_RANGES.jelly_wobble
const RIM = EFFECT_PARAM_RANGES.rim
const TRANSLUCENCY = EFFECT_PARAM_RANGES.translucency
const EMISSION_PULSE = EFFECT_PARAM_RANGES.emission_pulse

export const EFFECT_SPECS: Record<MaterialEffectType, EffectSpec> = {
  jelly_wobble: {
    label: 'Jelly wobble',
    params: [
      {
        key: 'amplitude',
        label: 'Amplitude',
        min: JELLY.amplitude[0],
        max: JELLY.amplitude[1],
        step: 0.005,
        drivable: true,
      },
      {
        key: 'frequency',
        label: 'Frequency',
        min: JELLY.frequency[0],
        max: JELLY.frequency[1],
        step: 0.1,
        drivable: true,
      },
      {
        key: 'waveScale',
        label: 'Wave scale',
        min: JELLY.waveScale[0],
        max: JELLY.waveScale[1],
        step: 0.1,
        drivable: true,
      },
      {
        key: 'seed',
        label: 'Seed',
        min: JELLY.seed[0],
        max: JELLY.seed[1],
        step: 1,
        integer: true,
        drivable: false,
      },
    ],
  },
  rim: {
    label: 'Rim glow',
    color: { key: 'color', label: 'Colour' },
    params: [
      {
        key: 'power',
        label: 'Edge sharpness',
        hint: 'Higher = thinner glow at the silhouette',
        min: RIM.power[0],
        max: RIM.power[1],
        step: 0.1,
        drivable: true,
      },
      {
        key: 'intensity',
        label: 'Intensity',
        hint: 'Brightness of the glow',
        min: RIM.intensity[0],
        max: RIM.intensity[1],
        step: 0.05,
        drivable: true,
      },
    ],
  },
  translucency: {
    label: 'Translucency',
    color: { key: 'interiorColor', label: 'Interior colour' },
    params: [
      {
        key: 'thickness',
        label: 'Thickness',
        min: TRANSLUCENCY.thickness[0],
        max: TRANSLUCENCY.thickness[1],
        step: 0.01,
        drivable: true,
      },
    ],
  },
  emission_pulse: {
    label: 'Emission pulse',
    color: { key: 'color', label: 'Colour' },
    params: [
      {
        key: 'intensity',
        label: 'Intensity',
        min: EMISSION_PULSE.intensity[0],
        max: EMISSION_PULSE.intensity[1],
        step: 0.05,
        drivable: true,
      },
      {
        key: 'rate',
        label: 'Rate',
        min: EMISSION_PULSE.rate[0],
        max: EMISSION_PULSE.rate[1],
        step: 0.1,
        drivable: true,
      },
    ],
  },
}

export const DRIVER_INPUT_LABELS: Record<MaterialEffectInputName, string> = {
  speed: 'Speed',
  impulse: 'Impulse',
  charge: 'Charge',
}

/** A fresh effect of `type`, with values that render visibly straight away. */
export function createDefaultEffect(type: MaterialEffectType): MaterialEffect {
  switch (type) {
    case 'jelly_wobble':
      return { type, amplitude: 0.03, frequency: 1.5, waveScale: 4, seed: 0 }
    case 'rim':
      return { type, color: '#ffcc66', power: 3, intensity: 1 }
    case 'translucency':
      return { type, interiorColor: '#2e5a12', thickness: 0.6 }
    case 'emission_pulse':
      return { type, color: '#ccff66', intensity: 1, rate: 2 }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * The furthest a jelly wobble can push a vertex at the given inputs: the base
 * amplitude plus the amplitude driver's contribution, clamped exactly as the
 * shader's `effectiveParam` does. The preview uses it to keep the wobbling
 * sphere inside the frame. Effects other than jelly wobble do not move verts.
 */
export function maxWobbleDisplacement(
  effects: MaterialEffect[],
  inputs: MaterialEffectInputs
): number {
  const jelly = effects.find(effect => effect.type === 'jelly_wobble')
  if (!jelly || jelly.type !== 'jelly_wobble') return 0
  const driver = jelly.drivers?.amplitude
  const contribution = driver ? inputs[driver.input] * driver.scale : 0
  return clamp(
    jelly.amplitude + contribution,
    JELLY.amplitude[0],
    JELLY.amplitude[1]
  )
}

/** The effect preview's vertical field of view. */
export const PREVIEW_FOV = 35

/** About 8% of padding around the sphere so the wobble never touches the frame. */
const PREVIEW_FRAMING_MARGIN = 1.08

/** Camera distance that fits a sphere of `radius` in the preview frame. */
export function fitCameraDistance(radius: number): number {
  return (
    (radius / Math.tan((PREVIEW_FOV * Math.PI) / 360)) * PREVIEW_FRAMING_MARGIN
  )
}

/**
 * The camera distance for a document's wobbling sphere: the base radius plus the
 * maximum jelly displacement. Without a jelly effect the radius is the sphere's
 * own 1 and the framing is unchanged.
 */
export function previewFitDistance(
  effects: MaterialEffect[],
  inputs: MaterialEffectInputs
): number {
  return fitCameraDistance(1 + maxWobbleDisplacement(effects, inputs))
}

/**
 * A per-unit scale that moves its param about half its range over the input's
 * full travel, rounded to 3 significant digits. Selecting a driver used to
 * leave the scale at zero, which made the binding look broken until the user
 * guessed a value; this gives them a starting value that visibly moves.
 */
export function defaultDriverScale(
  min: number,
  max: number,
  input: MaterialEffectInputName
): number {
  const raw = ((max - min) * 0.5) / INPUT_RANGES[input][1]
  if (raw === 0) return 0
  const exponent = Math.floor(Math.log10(Math.abs(raw)))
  const factor = Math.pow(10, 2 - exponent)
  return Math.round(raw * factor) / factor
}
