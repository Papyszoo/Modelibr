import type { VfxComponent, VfxComponentType, VfxDefinition } from '../types'

export const DEFAULT_VFX_DEFINITION: VfxDefinition = {
  version: 1,
  duration: 2,
  loop: false,
  components: [],
}

const LABELS: Record<VfxComponentType, string> = {
  particles: 'Particles',
  mesh: 'Mesh',
  light: 'Light',
  sound: 'Sound',
}

/** A free id like `particles-2`, unique within the effect. */
export function nextComponentId(
  definition: VfxDefinition,
  type: VfxComponentType
): string {
  const taken = new Set(definition.components.map(c => c.id))
  let n = 1
  while (taken.has(`${type}-${n}`)) n++
  return `${type}-${n}`
}

/**
 * A new component that is valid as it stands, so adding one never leaves the
 * effect unsavable. Mesh and sound need an asset, which the caller picks first.
 */
export function createComponent(
  definition: VfxDefinition,
  type: VfxComponentType,
  asset?: { id: number; versionId?: number | null }
): VfxComponent {
  const id = nextComponentId(definition, type)
  const duration = Math.min(1, definition.duration)
  const base = {
    id,
    type,
    name: `${LABELS[type]} ${id.split('-')[1]}`,
    start: 0,
    duration,
    position: [0, 0, 0] as [number, number, number],
  }

  switch (type) {
    case 'particles':
      return {
        ...base,
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
          seed: Math.floor(Math.random() * 100000),
        },
      }
    case 'mesh':
      return {
        ...base,
        mesh: { modelId: asset?.id ?? 0, versionId: asset?.versionId ?? null },
        tracks: { scale: [[0, 1]], opacity: [[0, 1]] },
      }
    case 'light':
      return {
        ...base,
        light: { color: '#ffb466', range: 6 },
        tracks: {
          intensity: [
            [0, 0],
            [Math.min(0.08, duration), 6],
            [duration, 0],
          ],
        },
      }
    case 'sound':
      return {
        ...base,
        sound: { soundId: asset?.id ?? 0, volume: 1 },
      }
  }
}

export function formatSeconds(value: number): string {
  return `${value.toFixed(2)} s`
}
