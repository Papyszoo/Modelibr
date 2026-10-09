import { strToU8, zipSync } from 'fflate'
import { http, HttpResponse } from 'msw'

import { now } from './shared'

/**
 * Demo VFX effects, held in memory for the session.
 *
 * Like demo scenes, they are not persisted to IndexedDB: an effect references
 * library assets by id, and the demo regenerates those ids when it is reseeded,
 * so an effect that survived would point at assets that no longer exist.
 */

type VfxComponentType = 'particles' | 'mesh' | 'light' | 'sound'

interface VfxComponent {
  id: string
  type: VfxComponentType
  name: string
  start: number
  duration: number
  position?: [number, number, number]
  particles?: Record<string, unknown>
  mesh?: { modelId: number; versionId?: number | null }
  light?: { color: string; range: number }
  sound?: { soundId: number; volume: number }
  tracks?: Record<string, [number, number][]>
}

interface VfxDefinition {
  version: 1
  duration: number
  loop: boolean
  components: VfxComponent[]
}

interface DemoVfx {
  id: number
  name: string
  description: string | null
  definition: VfxDefinition
  createdAt: string
  updatedAt: string
}

interface VfxProblem {
  path: string
  message: string
}

const TRACKS_BY_TYPE: Record<VfxComponentType, string[]> = {
  particles: [],
  mesh: ['scale', 'opacity', 'rotationY'],
  light: ['intensity'],
  sound: [],
}

function emptyDefinition(): VfxDefinition {
  return { version: 1, duration: 2, loop: false, components: [] }
}

function seedDefinition(): VfxDefinition {
  return {
    version: 1,
    duration: 3,
    loop: true,
    components: [
      {
        id: 'particles-1',
        type: 'particles',
        name: 'Flames',
        start: 0,
        duration: 3,
        position: [0, 0, 0],
        particles: {
          mode: 'continuous',
          rate: 80,
          count: 120,
          lifetime: 1.2,
          speed: 1.6,
          spread: 22,
          gravity: -3,
          sizeStart: 0.18,
          sizeEnd: 0,
          colorStart: '#ffd27a',
          colorEnd: '#ff4a1c',
          opacityStart: 1,
          opacityEnd: 0,
          blending: 'additive',
          spriteId: null,
          seed: 1337,
        },
      },
      {
        id: 'light-1',
        type: 'light',
        name: 'Flicker',
        start: 0,
        duration: 3,
        position: [0, 0.5, 0],
        light: { color: '#ffb466', range: 8 },
        tracks: {
          intensity: [
            [0, 4],
            [0.5, 7],
            [1, 4],
            [1.5, 7],
            [3, 3],
          ],
        },
      },
      {
        id: 'sound-1',
        type: 'sound',
        name: 'Crackle',
        start: 0,
        duration: 3,
        sound: { soundId: 1, volume: 0.6 },
      },
    ],
  }
}

const demoVfx = new Map<number, DemoVfx>()
let nextDemoVfxId = 1

function ensureSeeded(): void {
  if (demoVfx.size > 0) return
  const ts = now()
  demoVfx.set(1, {
    id: 1,
    name: 'Torch fire',
    description: 'A warm flame with a flicker light and a crackle.',
    definition: seedDefinition(),
    createdAt: ts,
    updatedAt: ts,
  })
  nextDemoVfxId = 2
}

/** One demo effect by id, for the project membership handlers. */
export function findDemoVfx(id: number): DemoVfx | undefined {
  ensureSeeded()
  return demoVfx.get(id)
}

/**
 * The demo has no worker to render an effect, so its thumbnail is a looping SVG
 * drawn from the effect's first particle colours. It is ready immediately; the
 * `v` query changes with the effect so an edit shows a fresh picture.
 */
function thumbnailUrl(effect: DemoVfx): string {
  return `/vfx/${effect.id}/thumbnail/file?v=${Date.parse(effect.updatedAt)}`
}

function demoThumbnailSvg(effect: DemoVfx): string {
  const particles = effect.definition.components.find(
    component => component.type === 'particles'
  )?.particles as { colorStart?: string; colorEnd?: string } | undefined
  const inner = particles?.colorStart ?? '#ffd27a'
  const outer = particles?.colorEnd ?? '#ff4a1c'
  const seconds = Math.max(effect.definition.duration, 1)

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect width="256" height="256" fill="#14161b"/>
  <ellipse cx="128" cy="214" rx="70" ry="10" fill="#1b1e25"/>
  <circle cx="128" cy="150" r="14" fill="${inner}" opacity="0.9">
    <animate attributeName="r" values="14;58;14" dur="${seconds}s" repeatCount="indefinite"/>
    <animate attributeName="fill" values="${inner};${outer};${inner}" dur="${seconds}s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.95;0.15;0.95" dur="${seconds}s" repeatCount="indefinite"/>
  </circle>
  <circle cx="128" cy="150" r="6" fill="#ffffff">
    <animate attributeName="cy" values="170;70;170" dur="${seconds}s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="1;0;1" dur="${seconds}s" repeatCount="indefinite"/>
  </circle>
</svg>`
}

function toSummary(effect: DemoVfx) {
  const { definition } = effect
  return {
    id: effect.id,
    name: effect.name,
    description: effect.description,
    duration: definition.duration,
    componentCount: definition.components.length,
    componentTypes: [
      ...new Set(definition.components.map(component => component.type)),
    ],
    updatedAt: effect.updatedAt,
    thumbnailUrl: thumbnailUrl(effect),
  }
}

function toDetail(effect: DemoVfx) {
  return {
    id: effect.id,
    name: effect.name,
    description: effect.description,
    definition: effect.definition,
    createdAt: effect.createdAt,
    updatedAt: effect.updatedAt,
    thumbnailUrl: thumbnailUrl(effect),
  }
}

/**
 * A small mirror of the server's definition validation, so the editor's
 * problem display has something real to show in the demo. It checks the
 * shape, the timing bounds and the per-type tracks - enough to catch the
 * mistakes an author actually makes.
 */
function validateDefinition(definition: unknown): VfxProblem[] {
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
        if (!component.mesh) add(`${path}.mesh`, 'A mesh needs a model.')
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

    const allowed = TRACKS_BY_TYPE[component.type as VfxComponentType] ?? []
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

function invalidDefinition(problems: VfxProblem[]) {
  return HttpResponse.json(
    {
      error: 'InvalidVfxDefinition',
      message: 'The effect definition is not valid.',
      problems,
    },
    { status: 400 }
  )
}

const slugify = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'effect'

export const vfxHandlers = [
  // ════════════════════════════════════════════════════════════════════════
  //  VFX
  // ════════════════════════════════════════════════════════════════════════

  http.get('*/vfx', async () => {
    ensureSeeded()
    return HttpResponse.json([...demoVfx.values()].map(toSummary))
  }),

  http.get('*/vfx/:id/thumbnail/file', async ({ params }) => {
    ensureSeeded()
    const effect = demoVfx.get(Number(params.id))
    if (!effect) return new HttpResponse(null, { status: 404 })
    return new HttpResponse(demoThumbnailSvg(effect), {
      headers: { 'Content-Type': 'image/svg+xml' },
    })
  }),

  http.get('*/vfx/:id/export/godot', async ({ params }) => {
    ensureSeeded()
    const effect = demoVfx.get(Number(params.id))
    if (!effect) return new HttpResponse(null, { status: 404 })
    const slug = slugify(effect.name)
    const bytes = zipSync({
      [`${slug}/effect.json`]: strToU8(
        JSON.stringify(effect.definition, null, 2)
      ),
      [`${slug}/README.txt`]: strToU8(
        `Godot export of "${effect.name}" (demo).\n`
      ),
    })
    return new HttpResponse(new Blob([bytes], { type: 'application/zip' }), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${slug}.zip"`,
      },
    })
  }),

  http.get('*/vfx/:id', async ({ params }) => {
    ensureSeeded()
    const effect = demoVfx.get(Number(params.id))
    return effect
      ? HttpResponse.json(toDetail(effect))
      : HttpResponse.json(
          { error: 'VfxNotFound', message: 'No such effect.' },
          { status: 404 }
        )
  }),

  http.post('*/vfx', async ({ request }) => {
    ensureSeeded()
    const body = (await request.json()) as {
      name?: string
      description?: string | null
      definition?: VfxDefinition
    }
    if (!body.name?.trim()) {
      return HttpResponse.json(
        { error: 'InvalidName', message: 'An effect needs a name.' },
        { status: 400 }
      )
    }
    if (body.definition) {
      const problems = validateDefinition(body.definition)
      if (problems.length > 0) return invalidDefinition(problems)
    }

    const ts = now()
    const effect: DemoVfx = {
      id: nextDemoVfxId++,
      name: body.name.trim(),
      description: body.description ?? null,
      definition: body.definition ?? emptyDefinition(),
      createdAt: ts,
      updatedAt: ts,
    }
    demoVfx.set(effect.id, effect)
    return HttpResponse.json(toDetail(effect), { status: 201 })
  }),

  http.put('*/vfx/:id', async ({ params, request }) => {
    ensureSeeded()
    const effect = demoVfx.get(Number(params.id))
    if (!effect) {
      return HttpResponse.json(
        { error: 'VfxNotFound', message: 'No such effect.' },
        { status: 404 }
      )
    }

    const body = (await request.json()) as {
      name?: string
      description?: string | null
      definition?: VfxDefinition
    }
    if (body.definition) {
      const problems = validateDefinition(body.definition)
      if (problems.length > 0) return invalidDefinition(problems)
    }

    if (body.name !== undefined) effect.name = body.name
    if (body.description !== undefined) effect.description = body.description
    if (body.definition !== undefined) effect.definition = body.definition
    effect.updatedAt = now()

    return HttpResponse.json(toDetail(effect))
  }),

  http.delete('*/vfx/:id', async ({ params }) => {
    ensureSeeded()
    demoVfx.delete(Number(params.id))
    return new HttpResponse(null, { status: 204 })
  }),
]
