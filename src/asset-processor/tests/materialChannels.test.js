import { describe, it, expect } from 'vitest'

import {
  mergeMaterialChannels,
  mergeMaterialChannelsPerMesh,
} from '../lib/materialChannels.js'

/** A stand-in for a three.js material: plain properties plus a clone(). */
function makeMaterial(props = {}) {
  return {
    ...props,
    clone() {
      return makeMaterial({ ...props })
    },
  }
}

function geometry(withColor) {
  return { hasAttribute: name => withColor && name === 'color' }
}

describe('mergeMaterialChannels', () => {
  it('fills a channel the Modelibr material leaves unset and returns it', () => {
    const original = makeMaterial({ map: 'model-map' })
    const next = makeMaterial()

    const result = mergeMaterialChannels(original, next)

    expect(result).toBe(next)
    expect(result.map).toBe('model-map')
  })

  it('lets a channel the Modelibr material sets win', () => {
    const original = makeMaterial({ map: 'model-map' })
    const next = makeMaterial({ map: 'set-map' })

    mergeMaterialChannels(original, next)

    expect(next.map).toBe('set-map')
  })
})

describe('mergeMaterialChannelsPerMesh', () => {
  // Regression: the shared wildcard "" texture-set material was merged into in
  // place, so the first mesh's map won and every later mesh silently wore it.
  it('merges into a fresh copy, leaving the shared template untouched', () => {
    const shared = makeMaterial({ roughness: 0.4 })
    const first = makeMaterial({ map: 'first-map' })
    const second = makeMaterial({ map: 'second-map' })

    const firstApplied = mergeMaterialChannelsPerMesh(first, shared)
    const secondApplied = mergeMaterialChannelsPerMesh(second, shared)

    expect(firstApplied).not.toBe(shared)
    expect(secondApplied).not.toBe(shared)
    expect(firstApplied).not.toBe(secondApplied)
    expect(firstApplied.map).toBe('first-map')
    expect(secondApplied.map).toBe('second-map')
    expect(firstApplied.roughness).toBe(0.4)
    // The template keeps none of the meshes' maps.
    expect(shared.map).toBeUndefined()
  })

  it('keeps each mesh vertexColors decision on its own copy', () => {
    const shared = makeMaterial()

    const withColor = mergeMaterialChannelsPerMesh(
      makeMaterial(),
      shared,
      geometry(true)
    )
    const without = mergeMaterialChannelsPerMesh(
      makeMaterial(),
      shared,
      geometry(false)
    )

    expect(withColor.vertexColors).toBe(true)
    expect(without.vertexColors).toBe(false)
    expect(shared.vertexColors).toBeUndefined()
  })

  it('merges in place when the material cannot be cloned', () => {
    const original = makeMaterial({ map: 'model-map' })
    const plain = { roughness: 1 }

    const result = mergeMaterialChannelsPerMesh(original, plain)

    expect(result).toBe(plain)
    expect(result.map).toBe('model-map')
  })
})
