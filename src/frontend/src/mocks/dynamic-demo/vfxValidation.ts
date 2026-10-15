/**
 * The demo's mirror of the server's definition validation.
 *
 * It is kept apart from the MSW handlers so it stays a pure function: the
 * editor's problem display gets something real to show in the demo, and the
 * checks can be tested without a browser or a service worker.
 */

export type VfxComponentType = 'particles' | 'mesh' | 'light' | 'sound'

export interface VfxMesh {
  kind?: 'disc' | 'ring'
  modelId?: number
  versionId?: number | null
  radius?: number
  innerRadius?: number
  outerRadius?: number
  color?: string
  emissiveIntensity?: number
}

export interface VfxEmitter {
  shape?: string
  radius?: number
  innerRadius?: number
  outerRadius?: number
}

export interface VfxComponent {
  id: string
  type: VfxComponentType
  name: string
  start: number
  duration: number
  position?: [number, number, number]
  particles?: Record<string, unknown>
  emitter?: VfxEmitter
  mesh?: VfxMesh
  light?: { color: string; range: number }
  sound?: { soundId: number; volume: number }
  tracks?: Record<string, [number, number][]>
}

export interface VfxDefinition {
  version: 1
  duration: number
  loop: boolean
  components: VfxComponent[]
}

export interface VfxProblem {
  path: string
  message: string
}

const TRACKS_BY_TYPE: Record<VfxComponentType, string[]> = {
  particles: [],
  mesh: ['scale', 'opacity', 'rotationY'],
  light: ['intensity'],
  sound: [],
}

/** Tracks a component may carry, including the conditional radius track. */
function allowedTracks(component: VfxComponent): string[] {
  const base = TRACKS_BY_TYPE[component.type] ?? []
  if (
    component.type === 'mesh' &&
    (component.mesh?.kind === 'disc' || component.mesh?.kind === 'ring')
  ) {
    return [...base, 'radius']
  }
  if (component.type === 'particles') {
    const shape = component.emitter?.shape
    if (shape === 'disc' || shape === 'ring') return [...base, 'radius']
  }
  return base
}

/**
 * Checks the shape, the timing bounds and the per-type tracks - enough to catch
 * the mistakes an author actually makes.
 */
export function validateDefinition(definition: unknown): VfxProblem[] {
  const problems: VfxProblem[] = []
  const add = (path: string, message: string) =>
    problems.push({ path, message })

  if (typeof definition !== 'object' || definition === null) {
    add('definition', 'The definition must be an object.')
    return problems
  }

  const doc = definition as Partial<VfxDefinition>
  if (doc.version !== 1) add('version', 'Unsupported definition version.')
  const duration = doc.duration
  if (typeof duration !== 'number' || !(duration > 0) || duration > 60) {
    add('duration', 'Duration must be between 0 and 60 seconds.')
  }
  if (!Array.isArray(doc.components)) {
    add('components', 'Components must be an array.')
    return problems
  }

  const seen = new Set<string>()
  doc.components.forEach((component, index) => {
    const path = `components[${index}]`
    if (!component || typeof component !== 'object') {
      add(path, 'Each component must be an object.')
      return
    }
    if (!component.id) add(`${path}.id`, 'A component needs an id.')
    else if (seen.has(component.id))
      add(`${path}.id`, 'Component ids must be unique.')
    else seen.add(component.id)

    if (!component.name) add(`${path}.name`, 'A component needs a name.')

    if (
      typeof component.start !== 'number' ||
      component.start < 0 ||
      (typeof duration === 'number' && component.start > duration)
    ) {
      add(`${path}.start`, 'Start must be inside the effect.')
    }
    if (typeof component.duration !== 'number' || component.duration <= 0) {
      add(`${path}.duration`, 'Duration must be greater than zero.')
    } else if (
      typeof component.start === 'number' &&
      typeof duration === 'number' &&
      component.start + component.duration > duration + 0.001
    ) {
      add(`${path}.duration`, 'The component runs past the end of the effect.')
    }

    switch (component.type) {
      case 'particles':
        if (!component.particles)
          add(`${path}.particles`, 'Particles settings are missing.')
        break
      case 'mesh':
        if (!component.mesh) {
          add(`${path}.mesh`, 'A mesh needs a model.')
          break
        }
        {
          const mesh = component.mesh
          const primitive = mesh.kind === 'disc' || mesh.kind === 'ring'
          if (
            primitive &&
            mesh.color !== undefined &&
            (typeof mesh.color !== 'string' ||
              !/^#[0-9a-fA-F]{6}$/.test(mesh.color))
          ) {
            add(`${path}.mesh.color`, 'Colour must be in #rrggbb format.')
          }
          if (
            primitive &&
            mesh.emissiveIntensity !== undefined &&
            (typeof mesh.emissiveIntensity !== 'number' ||
              mesh.emissiveIntensity < 0 ||
              mesh.emissiveIntensity > 10)
          ) {
            add(
              `${path}.mesh.emissiveIntensity`,
              'Emissive intensity must be between 0 and 10.'
            )
          }
        }
        break
      case 'light':
        if (!component.light)
          add(`${path}.light`, 'Light settings are missing.')
        break
      case 'sound':
        if (!component.sound) add(`${path}.sound`, 'A sound needs an asset.')
        break
      default:
        add(`${path}.type`, 'Unknown component type.')
    }

    const allowed = allowedTracks(component)
    for (const track of Object.keys(component.tracks ?? {})) {
      if (!allowed.includes(track)) {
        add(
          `${path}.tracks.${track}`,
          `A ${component.type} cannot use the ${track} track.`
        )
      }
    }
  })

  return problems
}
