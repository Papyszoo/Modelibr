import { describe, it, expect } from 'vitest'

import {
  BLOCKED_RESOURCE_URL,
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
    // which for a data-URL main is the base64 blob - the tail still ends with the
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

  it('blocks an unresolved reference instead of letting it be fetched', () => {
    const resolve = buildResourceResolver(resources)
    const missing = 'textures/missing-normal.png'
    // Regression: returning the input untouched let the loader issue a real
    // request for it. Nothing unmapped may reach the network.
    expect(resolve(missing)).toBe(BLOCKED_RESOURCE_URL)
  })

  it('blocks absolute and protocol-relative URLs a glTF names (offline invariant)', () => {
    const blocked = []
    const resolve = buildResourceResolver(resources, {
      onBlocked: url => blocked.push(url),
    })

    expect(resolve('http://evil.example/x.bin')).toBe(BLOCKED_RESOURCE_URL)
    expect(resolve('https://evil.example/x.png')).toBe(BLOCKED_RESOURCE_URL)
    expect(resolve('//192.168.1.10/share/x.bin')).toBe(BLOCKED_RESOURCE_URL)
    expect(resolve('file:///etc/passwd')).toBe(BLOCKED_RESOURCE_URL)
    expect(blocked).toHaveLength(4)
  })

  it('lets the caller allow-list its own URLs (in-app viewer file route)', () => {
    const resolve = buildResourceResolver(resources, {
      allow: url => /\/files\/\d+$/.test(url),
    })
    expect(resolve('/api/files/42')).toBe('/api/files/42')
    expect(resolve('http://evil.example/files/42x')).toBe(BLOCKED_RESOURCE_URL)
  })

  it('passes blob: URLs through (bytes the caller already holds)', () => {
    const resolve = buildResourceResolver(resources)
    expect(resolve('blob:http://localhost/abc-123')).toBe(
      'blob:http://localhost/abc-123'
    )
  })

  it('handles empty/absent resource maps without throwing, and still blocks', () => {
    expect(buildResourceResolver(null)('scene.bin')).toBe(BLOCKED_RESOURCE_URL)
    expect(buildResourceResolver({})('scene.bin')).toBe(BLOCKED_RESOURCE_URL)
    expect(buildResourceResolver(undefined)('scene.bin')).toBe(
      BLOCKED_RESOURCE_URL
    )
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
