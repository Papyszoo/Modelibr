import { describe, it, expect } from 'vitest'

import {
  buildResourceResolver,
  normalizeResourceKey,
} from '../lib/gltfResources.js'

describe('normalizeResourceKey', () => {
  it('strips leading ./ and /, and normalizes backslashes', () => {
    expect(normalizeResourceKey('./scene.bin')).toBe('scene.bin')
    expect(normalizeResourceKey('/textures/wood.png')).toBe('textures/wood.png')
    expect(normalizeResourceKey('textures\\wood.png')).toBe('textures/wood.png')
  })

  it('decodes percent-encoded segments', () => {
    expect(normalizeResourceKey('textures/wood%20oak.png')).toBe(
      'textures/wood oak.png'
    )
  })
})

describe('buildResourceResolver', () => {
  const resources = {
    'scene.bin': 'data:application/octet-stream;base64,AAA',
    'textures/wood.png': 'data:image/png;base64,BBB',
  }

  it('resolves an exact relative-path match', () => {
    const resolve = buildResourceResolver(resources)
    expect(resolve('scene.bin')).toBe(resources['scene.bin'])
    expect(resolve('textures/wood.png')).toBe(resources['textures/wood.png'])
  })

  it('resolves a suffix match against a mangled absolute/base-prefixed URL', () => {
    const resolve = buildResourceResolver(resources)
    // GLTFLoader resolves sub-resources against the main resource's base path,
    // which for a data-URL main is the base64 blob — the tail still ends with the
    // URI, and the base64 (no '.') can't collide with a real filename key.
    expect(
      resolve('data:model/gltf+json;base64,ZZAABBCC/textures/wood.png')
    ).toBe(resources['textures/wood.png'])
    expect(resolve('http://localhost:1234/render/scene.bin')).toBe(
      resources['scene.bin']
    )
  })

  it('falls back to basename when only the filename survives', () => {
    const resolve = buildResourceResolver(resources)
    expect(resolve('file:///tmp/whatever/wood.png')).toBe(
      resources['textures/wood.png']
    )
  })

  it('prefers the most specific key over a bare basename match', () => {
    const resolve = buildResourceResolver({
      'a/tex.png': 'data:image/png;base64,AAA',
      'b/tex.png': 'data:image/png;base64,BBB',
    })
    // The full relative path wins the suffix match.
    expect(resolve('.../b/tex.png')).toBe('data:image/png;base64,BBB')
  })

  it('passes a genuine embedded data URI through untouched (pure base64, no key collision)', () => {
    const resolve = buildResourceResolver(resources)
    const embedded = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg'
    expect(resolve(embedded)).toBe(embedded)
  })

  it('returns an unresolved reference untouched (offline: never fabricates a host)', () => {
    const resolve = buildResourceResolver(resources)
    const missing = 'textures/missing-normal.png'
    // Unchanged input — it resolves against the local page origin and fails
    // locally, it is never rewritten to an external URL.
    expect(resolve(missing)).toBe(missing)
  })

  it('handles empty/absent resource maps without throwing', () => {
    expect(buildResourceResolver(null)('scene.bin')).toBe('scene.bin')
    expect(buildResourceResolver({})('scene.bin')).toBe('scene.bin')
    expect(buildResourceResolver(undefined)('scene.bin')).toBe('scene.bin')
  })

  it('accepts a Map as well as a plain object', () => {
    const resolve = buildResourceResolver(
      new Map([['scene.bin', 'data:application/octet-stream;base64,AAA']])
    )
    expect(resolve('scene.bin')).toBe(
      'data:application/octet-stream;base64,AAA'
    )
  })
})
