import * as THREE from 'three'

/**
 * Runtime material effects (phase 4): the same small, engine-portable shader
 * vocabulary the backend validates and the Godot exporter emits, rendered on an
 * existing three.js material through `onBeforeCompile`.
 *
 * The document shape mirrors `Domain/ValueObjects/MaterialEffectsDefinition.cs`
 * and its camelCase JSON. Nothing here ever replaces or clones a material, so
 * maps, vertex colours, skinning and morph targets keep working untouched.
 */

export type MaterialEffectType =
  | 'jelly_wobble'
  | 'rim'
  | 'translucency'
  | 'emission_pulse'

export type MaterialEffectInputName = 'speed' | 'impulse' | 'charge'

/** Maps one numeric effect param to an input and the per-unit amount it adds. */
export interface MaterialEffectDriver {
  input: MaterialEffectInputName
  scale: number
}

export interface JellyWobbleEffect {
  type: 'jelly_wobble'
  amplitude: number
  frequency: number
  waveScale: number
  seed: number
  drivers?: Record<string, MaterialEffectDriver>
}

export interface RimEffect {
  type: 'rim'
  color: string
  power: number
  intensity: number
  drivers?: Record<string, MaterialEffectDriver>
}

export interface TranslucencyEffect {
  type: 'translucency'
  interiorColor: string
  thickness: number
  drivers?: Record<string, MaterialEffectDriver>
}

export interface EmissionPulseEffect {
  type: 'emission_pulse'
  color: string
  intensity: number
  rate: number
  drivers?: Record<string, MaterialEffectDriver>
}

export type MaterialEffect =
  | JellyWobbleEffect
  | RimEffect
  | TranslucencyEffect
  | EmissionPulseEffect

export interface MaterialPreviewInputs {
  speed?: number
  impulse?: number
  charge?: number
}

export interface MaterialEffectsDocument {
  version: 1
  effects: MaterialEffect[]
  previewInputs?: MaterialPreviewInputs
}

/** A fully resolved set of driver input values. */
export interface MaterialEffectInputs {
  speed: number
  impulse: number
  charge: number
}

export const DEFAULT_EFFECT_INPUTS: MaterialEffectInputs = {
  speed: 0,
  impulse: 0,
  charge: 0,
}

// -- Validation ---------------------------------------------------------------

const EFFECT_TYPES: readonly MaterialEffectType[] = [
  'jelly_wobble',
  'rim',
  'translucency',
  'emission_pulse',
]

const DRIVER_INPUTS: readonly MaterialEffectInputName[] = [
  'speed',
  'impulse',
  'charge',
]

const MAX_EFFECTS = 4

/** Numeric params a driver may map, with their clamped ranges. */
const DRIVABLE_PARAMS: Record<
  MaterialEffectType,
  Record<string, [number, number]>
> = {
  jelly_wobble: {
    amplitude: [0, 0.5],
    frequency: [0, 10],
    waveScale: [0, 20],
  },
  rim: { power: [0.5, 8], intensity: [0, 10] },
  translucency: { thickness: [0, 1] },
  emission_pulse: { intensity: [0, 10], rate: [0, 20] },
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value >= min && value <= max ? value : null
}

function readColor(value: unknown): string | null {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value : null
}

function readDrivers(
  value: unknown,
  type: MaterialEffectType
): Record<string, MaterialEffectDriver> | null | undefined {
  if (value === undefined || value === null) return undefined
  if (!isRecord(value)) return null
  const allowed = DRIVABLE_PARAMS[type]
  const drivers: Record<string, MaterialEffectDriver> = {}
  for (const [param, rawDriver] of Object.entries(value)) {
    if (!(param in allowed)) return null
    if (!isRecord(rawDriver)) return null
    const input = rawDriver.input
    const scale = readNumber(rawDriver.scale, -100, 100)
    if (
      typeof input !== 'string' ||
      !DRIVER_INPUTS.includes(input as MaterialEffectInputName) ||
      scale === null
    ) {
      return null
    }
    drivers[param] = {
      input: input as MaterialEffectInputName,
      scale,
    }
  }
  return drivers
}

function parseEffect(value: unknown): MaterialEffect | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null
  const type = value.type as MaterialEffectType
  if (!EFFECT_TYPES.includes(type)) return null

  if (type === 'jelly_wobble') {
    const amplitude = readNumber(value.amplitude, 0, 0.5)
    const frequency = readNumber(value.frequency, 0, 10)
    const waveScale = readNumber(value.waveScale, 0, 20)
    const seed = readNumber(value.seed, 0, 1000)
    const drivers = readDrivers(value.drivers, type)
    if (amplitude === null || frequency === null || waveScale === null) {
      return null
    }
    if (seed === null || !Number.isInteger(seed) || drivers === null) {
      return null
    }
    return { type, amplitude, frequency, waveScale, seed, drivers }
  }

  if (type === 'rim') {
    const color = readColor(value.color)
    const power = readNumber(value.power, 0.5, 8)
    const intensity = readNumber(value.intensity, 0, 10)
    const drivers = readDrivers(value.drivers, type)
    if (color === null || power === null || intensity === null) return null
    if (drivers === null) return null
    return { type, color, power, intensity, drivers }
  }

  if (type === 'translucency') {
    const interiorColor = readColor(value.interiorColor)
    const thickness = readNumber(value.thickness, 0, 1)
    const drivers = readDrivers(value.drivers, type)
    if (interiorColor === null || thickness === null) return null
    if (drivers === null) return null
    return { type, interiorColor, thickness, drivers }
  }

  const color = readColor(value.color)
  const intensity = readNumber(value.intensity, 0, 10)
  const rate = readNumber(value.rate, 0, 20)
  const drivers = readDrivers(value.drivers, type)
  if (color === null || intensity === null || rate === null) return null
  if (drivers === null) return null
  return { type, color, intensity, rate, drivers }
}

function parsePreviewInputs(
  value: unknown
): MaterialPreviewInputs | null | undefined {
  if (value === undefined || value === null) return undefined
  if (!isRecord(value)) return null
  const inputs: MaterialPreviewInputs = {}
  for (const [key, raw] of Object.entries(value)) {
    if (key === 'speed') {
      const speed = readNumber(raw, 0, 20)
      if (speed === null) return null
      inputs.speed = speed
    } else if (key === 'impulse') {
      const impulse = readNumber(raw, 0, 1)
      if (impulse === null) return null
      inputs.impulse = impulse
    } else if (key === 'charge') {
      const charge = readNumber(raw, 0, 1)
      if (charge === null) return null
      inputs.charge = charge
    } else {
      return null
    }
  }
  return inputs
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Parse and validate a material effects document. Returns null for null, an
 * empty value, malformed JSON, or anything the backend validator would reject.
 * Never throws: a bad document renders the material with its scalar params only.
 */
export function parseMaterialEffects(
  input: unknown
): MaterialEffectsDocument | null {
  if (input === null || input === undefined) return null
  const raw = typeof input === 'string' ? tryParseJson(input) : input
  if (!isRecord(raw)) return null
  if (raw.version !== 1) return null
  if (!Array.isArray(raw.effects) || raw.effects.length > MAX_EFFECTS) {
    return null
  }

  const effects: MaterialEffect[] = []
  const seen = new Set<MaterialEffectType>()
  for (const item of raw.effects) {
    const effect = parseEffect(item)
    if (!effect || seen.has(effect.type)) return null
    seen.add(effect.type)
    effects.push(effect)
  }

  const previewInputs = parsePreviewInputs(raw.previewInputs)
  if (previewInputs === null) return null

  const document: MaterialEffectsDocument = { version: 1, effects }
  if (previewInputs) document.previewInputs = previewInputs
  return document
}

/**
 * True when the document carries at least one effect to install or advance.
 * A null document, or one with no effects, is the plain PBR material every
 * caller has today - the check that keeps effect-free paths free.
 */
export function hasMaterialEffects(
  effects: MaterialEffectsDocument | null | undefined
): effects is MaterialEffectsDocument {
  return !!effects && effects.effects.length > 0
}

// -- Shader construction ------------------------------------------------------

const VERTEX_SKIN_ANCHOR = '#include <skinning_vertex>'
const FRAGMENT_EMISSIVE_ANCHOR = '#include <emissivemap_fragment>'

const INPUT_UNIFORM: Record<MaterialEffectInputName, string> = {
  speed: 'uInputSpeed',
  impulse: 'uInputImpulse',
  charge: 'uInputCharge',
}

function pascalCase(part: string): string {
  return part.charAt(0).toUpperCase() + part.slice(1)
}

function paramUniform(type: MaterialEffectType, param: string): string {
  return `u${type.split('_').map(pascalCase).join('')}${pascalCase(param)}`
}

function scaleUniform(type: MaterialEffectType, param: string): string {
  return `${paramUniform(type, param)}Scale`
}

function floatLiteral(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`
}

/**
 * `clamp(base + input * scale, min, max)` for one drivable param. The input
 * uniform is fixed at compile time; the program cache key includes the driver
 * bindings, so changing which input drives a param recompiles.
 */
function effectiveParam(
  type: MaterialEffectType,
  param: string,
  drivers?: Record<string, MaterialEffectDriver>
): string {
  const [min, max] = DRIVABLE_PARAMS[type][param]
  const input = INPUT_UNIFORM[drivers?.[param]?.input ?? 'speed']
  return `clamp(${paramUniform(type, param)} + ${input} * ${scaleUniform(
    type,
    param
  )}, ${floatLiteral(min)}, ${floatLiteral(max)})`
}

function findEffect<T extends MaterialEffectType>(
  effects: MaterialEffectsDocument,
  type: T
): Extract<MaterialEffect, { type: T }> | undefined {
  return effects.effects.find(effect => effect.type === type) as
    | Extract<MaterialEffect, { type: T }>
    | undefined
}

function vertexInjection(effects: MaterialEffectsDocument): string {
  const jelly = findEffect(effects, 'jelly_wobble')
  if (!jelly) return ''

  const amplitude = effectiveParam('jelly_wobble', 'amplitude', jelly.drivers)
  const frequency = effectiveParam('jelly_wobble', 'frequency', jelly.drivers)
  const waveScale = effectiveParam('jelly_wobble', 'waveScale', jelly.drivers)
  const seed = paramUniform('jelly_wobble', 'seed')

  return `
  float materialEffectWobble = ${amplitude} * sin(6.2831853 * ${frequency} * uEffectTime + ${waveScale} * (transformed.x + 1.3 * transformed.y + 0.7 * transformed.z) + ${seed});
  transformed += objectNormal * materialEffectWobble;
`
}

function fragmentInjection(effects: MaterialEffectsDocument): string {
  const rim = findEffect(effects, 'rim')
  const translucency = findEffect(effects, 'translucency')
  const pulse = findEffect(effects, 'emission_pulse')
  if (!rim && !translucency && !pulse) return ''

  const lines: string[] = []
  if (rim || translucency) {
    lines.push('vec3 materialEffectViewDir = normalize(vViewPosition);')
    lines.push(
      'float materialEffectNdotV = clamp(dot(normal, materialEffectViewDir), 0.0, 1.0);'
    )
  }
  if (rim) {
    const power = effectiveParam('rim', 'power', rim.drivers)
    const intensity = effectiveParam('rim', 'intensity', rim.drivers)
    lines.push(
      `totalEmissiveRadiance += ${paramUniform('rim', 'color')} * ${intensity} * pow(1.0 - materialEffectNdotV, ${power});`
    )
  }
  if (translucency) {
    const thickness = effectiveParam(
      'translucency',
      'thickness',
      translucency.drivers
    )
    lines.push(
      `totalEmissiveRadiance += ${paramUniform('translucency', 'interiorColor')} * ${thickness} * 0.5 * materialEffectNdotV;`
    )
  }
  if (pulse) {
    const intensity = effectiveParam(
      'emission_pulse',
      'intensity',
      pulse.drivers
    )
    const rate = effectiveParam('emission_pulse', 'rate', pulse.drivers)
    lines.push(
      `totalEmissiveRadiance += ${paramUniform('emission_pulse', 'color')} * ${intensity} * (0.5 + 0.5 * sin(6.2831853 * ${rate} * uEffectTime));`
    )
  }
  return `\n  ${lines.join('\n  ')}\n`
}

function uniformDeclarations(effects: MaterialEffectsDocument): string {
  const lines = [
    'uniform float uEffectTime;',
    'uniform float uInputSpeed;',
    'uniform float uInputImpulse;',
    'uniform float uInputCharge;',
  ]

  for (const effect of effects.effects) {
    if (effect.type === 'jelly_wobble') {
      for (const param of ['amplitude', 'frequency', 'waveScale']) {
        lines.push(`uniform float ${paramUniform('jelly_wobble', param)};`)
        lines.push(`uniform float ${scaleUniform('jelly_wobble', param)};`)
      }
      lines.push(`uniform float ${paramUniform('jelly_wobble', 'seed')};`)
    } else if (effect.type === 'rim') {
      lines.push(`uniform vec3 ${paramUniform('rim', 'color')};`)
      for (const param of ['power', 'intensity']) {
        lines.push(`uniform float ${paramUniform('rim', param)};`)
        lines.push(`uniform float ${scaleUniform('rim', param)};`)
      }
    } else if (effect.type === 'translucency') {
      lines.push(
        `uniform vec3 ${paramUniform('translucency', 'interiorColor')};`
      )
      lines.push(`uniform float ${paramUniform('translucency', 'thickness')};`)
      lines.push(`uniform float ${scaleUniform('translucency', 'thickness')};`)
    } else {
      lines.push(`uniform vec3 ${paramUniform('emission_pulse', 'color')};`)
      for (const param of ['intensity', 'rate']) {
        lines.push(`uniform float ${paramUniform('emission_pulse', param)};`)
        lines.push(`uniform float ${scaleUniform('emission_pulse', param)};`)
      }
    }
  }

  return `${lines.join('\n')}\n`
}

function buildUniforms(
  effects: MaterialEffectsDocument | null
): Record<string, THREE.IUniform> {
  const uniforms: Record<string, THREE.IUniform> = {
    uEffectTime: { value: 0 },
    uInputSpeed: { value: 0 },
    uInputImpulse: { value: 0 },
    uInputCharge: { value: 0 },
  }
  if (!effects) return uniforms

  const scale = (type: MaterialEffectType, param: string, value: number) => {
    uniforms[scaleUniform(type, param)] = { value }
  }

  for (const effect of effects.effects) {
    if (effect.type === 'jelly_wobble') {
      uniforms[paramUniform('jelly_wobble', 'amplitude')] = {
        value: effect.amplitude,
      }
      uniforms[paramUniform('jelly_wobble', 'frequency')] = {
        value: effect.frequency,
      }
      uniforms[paramUniform('jelly_wobble', 'waveScale')] = {
        value: effect.waveScale,
      }
      uniforms[paramUniform('jelly_wobble', 'seed')] = { value: effect.seed }
      scale('jelly_wobble', 'amplitude', effect.drivers?.amplitude?.scale ?? 0)
      scale('jelly_wobble', 'frequency', effect.drivers?.frequency?.scale ?? 0)
      scale('jelly_wobble', 'waveScale', effect.drivers?.waveScale?.scale ?? 0)
    } else if (effect.type === 'rim') {
      uniforms[paramUniform('rim', 'color')] = {
        value: new THREE.Color(effect.color),
      }
      uniforms[paramUniform('rim', 'power')] = { value: effect.power }
      uniforms[paramUniform('rim', 'intensity')] = { value: effect.intensity }
      scale('rim', 'power', effect.drivers?.power?.scale ?? 0)
      scale('rim', 'intensity', effect.drivers?.intensity?.scale ?? 0)
    } else if (effect.type === 'translucency') {
      uniforms[paramUniform('translucency', 'interiorColor')] = {
        value: new THREE.Color(effect.interiorColor),
      }
      uniforms[paramUniform('translucency', 'thickness')] = {
        value: effect.thickness,
      }
      scale('translucency', 'thickness', effect.drivers?.thickness?.scale ?? 0)
    } else {
      uniforms[paramUniform('emission_pulse', 'color')] = {
        value: new THREE.Color(effect.color),
      }
      uniforms[paramUniform('emission_pulse', 'intensity')] = {
        value: effect.intensity,
      }
      uniforms[paramUniform('emission_pulse', 'rate')] = { value: effect.rate }
      scale(
        'emission_pulse',
        'intensity',
        effect.drivers?.intensity?.scale ?? 0
      )
      scale('emission_pulse', 'rate', effect.drivers?.rate?.scale ?? 0)
    }
  }

  return uniforms
}

function setScalar(
  uniforms: Record<string, THREE.IUniform>,
  name: string,
  value: number
): void {
  const uniform = uniforms[name]
  if (uniform) uniform.value = value
}

function setColor(
  uniforms: Record<string, THREE.IUniform>,
  name: string,
  hex: string
): void {
  const uniform = uniforms[name]
  if (uniform) (uniform.value as THREE.Color).set(hex)
}

function applyUniformValues(
  state: MaterialEffectState,
  effects: MaterialEffectsDocument | null,
  inputs: MaterialEffectInputs,
  time: number
): void {
  const uniforms = state.uniforms
  setScalar(uniforms, 'uEffectTime', time)
  setScalar(uniforms, 'uInputSpeed', inputs.speed)
  setScalar(uniforms, 'uInputImpulse', inputs.impulse)
  setScalar(uniforms, 'uInputCharge', inputs.charge)
  if (!effects) return

  for (const effect of effects.effects) {
    if (effect.type === 'jelly_wobble') {
      setScalar(
        uniforms,
        paramUniform('jelly_wobble', 'amplitude'),
        effect.amplitude
      )
      setScalar(
        uniforms,
        paramUniform('jelly_wobble', 'frequency'),
        effect.frequency
      )
      setScalar(
        uniforms,
        paramUniform('jelly_wobble', 'waveScale'),
        effect.waveScale
      )
      setScalar(uniforms, paramUniform('jelly_wobble', 'seed'), effect.seed)
      setScalar(
        uniforms,
        scaleUniform('jelly_wobble', 'amplitude'),
        effect.drivers?.amplitude?.scale ?? 0
      )
      setScalar(
        uniforms,
        scaleUniform('jelly_wobble', 'frequency'),
        effect.drivers?.frequency?.scale ?? 0
      )
      setScalar(
        uniforms,
        scaleUniform('jelly_wobble', 'waveScale'),
        effect.drivers?.waveScale?.scale ?? 0
      )
    } else if (effect.type === 'rim') {
      setColor(uniforms, paramUniform('rim', 'color'), effect.color)
      setScalar(uniforms, paramUniform('rim', 'power'), effect.power)
      setScalar(uniforms, paramUniform('rim', 'intensity'), effect.intensity)
      setScalar(
        uniforms,
        scaleUniform('rim', 'power'),
        effect.drivers?.power?.scale ?? 0
      )
      setScalar(
        uniforms,
        scaleUniform('rim', 'intensity'),
        effect.drivers?.intensity?.scale ?? 0
      )
    } else if (effect.type === 'translucency') {
      setColor(
        uniforms,
        paramUniform('translucency', 'interiorColor'),
        effect.interiorColor
      )
      setScalar(
        uniforms,
        paramUniform('translucency', 'thickness'),
        effect.thickness
      )
      setScalar(
        uniforms,
        scaleUniform('translucency', 'thickness'),
        effect.drivers?.thickness?.scale ?? 0
      )
    } else {
      setColor(uniforms, paramUniform('emission_pulse', 'color'), effect.color)
      setScalar(
        uniforms,
        paramUniform('emission_pulse', 'intensity'),
        effect.intensity
      )
      setScalar(uniforms, paramUniform('emission_pulse', 'rate'), effect.rate)
      setScalar(
        uniforms,
        scaleUniform('emission_pulse', 'intensity'),
        effect.drivers?.intensity?.scale ?? 0
      )
      setScalar(
        uniforms,
        scaleUniform('emission_pulse', 'rate'),
        effect.drivers?.rate?.scale ?? 0
      )
    }
  }
}

// -- Material state -----------------------------------------------------------

interface MaterialEffectState {
  effects: MaterialEffectsDocument | null
  /** Structural signature; its change is what makes the shader recompile. */
  programKey: string
  uniforms: Record<string, THREE.IUniform>
  inputs: MaterialEffectInputs
}

function getState(material: THREE.Material): MaterialEffectState | undefined {
  return material.userData.materialEffectState as
    | MaterialEffectState
    | undefined
}

/**
 * Stable signature of everything the injected GLSL structure depends on: which
 * effect types are present (sorted) and which input drives each param. Param
 * values and input values are uniforms, so they are deliberately excluded.
 */
function structuralKey(effects: MaterialEffectsDocument | null): string {
  if (!hasMaterialEffects(effects)) return ''
  return effects.effects
    .map(effect => {
      const drivers = effect.drivers
        ? Object.keys(effect.drivers)
            .sort()
            .map(param => `${param}=${effect.drivers![param].input}`)
            .join(',')
        : ''
      return `${effect.type}[${drivers}]`
    })
    .sort()
    .join('+')
}

function inputsFromDocument(
  effects: MaterialEffectsDocument | null
): MaterialEffectInputs {
  const preview = effects?.previewInputs ?? {}
  return {
    speed: preview.speed ?? 0,
    impulse: preview.impulse ?? 0,
    charge: preview.charge ?? 0,
  }
}

function installEffectHook(material: THREE.Material): void {
  const state: MaterialEffectState = {
    effects: null,
    programKey: '',
    uniforms: buildUniforms(null),
    inputs: { ...DEFAULT_EFFECT_INPUTS },
  }
  material.userData.materialEffectState = state

  const previousOnBeforeCompile = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile?.call(material, shader, renderer)

    Object.assign(shader.uniforms, state.uniforms)

    const current = state.effects
    if (!current || current.effects.length === 0) return

    const declarations = uniformDeclarations(current)
    shader.vertexShader = declarations + shader.vertexShader
    shader.fragmentShader = declarations + shader.fragmentShader

    const vertex = vertexInjection(current)
    if (vertex) {
      shader.vertexShader = shader.vertexShader.replace(
        VERTEX_SKIN_ANCHOR,
        VERTEX_SKIN_ANCHOR + vertex
      )
    }

    const fragment = fragmentInjection(current)
    if (fragment) {
      shader.fragmentShader = shader.fragmentShader.replace(
        FRAGMENT_EMISSIVE_ANCHOR,
        FRAGMENT_EMISSIVE_ANCHOR + fragment
      )
    }
  }

  const previousCacheKey = material.customProgramCacheKey
  material.customProgramCacheKey = () => {
    const previous = previousCacheKey ? previousCacheKey.call(material) : ''
    const token = state.programKey ? `effects-${state.programKey}` : 'effects'
    return previous ? `${token}|${previous}` : token
  }
}

/**
 * Install the effect shader on an existing material. Composes with whatever
 * `onBeforeCompile` the material already has (the displacement-normals hook in
 * particular) rather than replacing it, and never touches the material's maps,
 * vertex colours, skinning or morph settings.
 *
 * Passing null on a material that has never had effects leaves it untouched.
 */
export function applyMaterialEffects(
  material: THREE.Material,
  effects: MaterialEffectsDocument | null
): void {
  const incoming = hasMaterialEffects(effects) ? effects : null
  const existing = getState(material)

  if (!incoming && !existing) return

  if (!existing) installEffectHook(material)
  const state = getState(material)
  if (!state) return

  const nextKey = structuralKey(incoming)
  if (nextKey !== state.programKey) {
    state.programKey = nextKey
    state.uniforms = buildUniforms(incoming)
    material.needsUpdate = true
  }
  state.effects = incoming
  state.inputs = inputsFromDocument(incoming)
  applyUniformValues(state, incoming, state.inputs, 0)
}

/**
 * Update effect uniforms only. Param and input value changes never recompile;
 * a change to the set of effect types (or which input drives a param) does.
 *
 * `time` is the effects clock in seconds - explicit in renders, the frame clock
 * in the live editor.
 */
export function updateMaterialEffects(
  material: THREE.Material,
  effects: MaterialEffectsDocument | null,
  inputs: Partial<MaterialEffectInputs> = {},
  time = 0
): void {
  let state = getState(material)
  if (!state) {
    if (!hasMaterialEffects(effects)) return
    applyMaterialEffects(material, effects)
    state = getState(material)
    if (!state) return
  }

  const nextKey = structuralKey(effects)
  const programChanged = nextKey !== state.programKey
  if (programChanged) {
    state.programKey = nextKey
    state.uniforms = buildUniforms(effects)
  }
  state.effects = effects
  state.inputs = { ...state.inputs, ...inputs }
  applyUniformValues(state, effects, state.inputs, time)
  if (programChanged) material.needsUpdate = true
}

/**
 * Advance every effect material under a root to `time`. Materials without an
 * effect state (the common case) are skipped without allocation. Used by the
 * viewer, the scene editor and the material preview from `useFrame`.
 */
export function advanceMaterialEffects(
  root: THREE.Object3D,
  time: number
): void {
  root.traverse(child => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material]
    for (const material of materials) {
      if (!material) continue
      const state = getState(material)
      if (!state) continue
      updateMaterialEffects(material, state.effects, state.inputs, time)
    }
  })
}
