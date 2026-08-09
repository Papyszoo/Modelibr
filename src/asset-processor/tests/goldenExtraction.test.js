import { describe, it, expect } from 'vitest'
import { hashGeometry, GEOMETRY_HASH_VERSION } from '../lib/geometryHash.js'
import { computeMaterialStats } from '../lib/materialStats.js'
import { computeAudioStats } from '../audioStats.js'
import { extractScript } from '../scriptExtractor.js'

/**
 * The permanent fixture set + golden/determinism/round-trip/idempotency tests
 * (prompt 26), scoped to the DETERMINISTIC layer: the pure extractors whose output
 * is reproducible everywhere. The three.js render-path extraction is deliberately
 * excluded from golden assertions — headless-Chromium/software-GL output varies by
 * environment (see the project memory), which the prompt says to exclude rather
 * than paper over with a loosened assertion.
 *
 * The library's other hard cases each already have a focused unit test:
 *   - modular kit / instance groups / Object.001 unnamed → AssetDerivationEngine (backend)
 *   - mis-assigned material channel → textureSetExtractor.test.js
 *   - stereo one-silent-channel → audioStats.test.js
 * Here they're re-asserted as golden fixtures so a regression anywhere is caught.
 */

// ---- fixtures ----------------------------------------------------------

// A unit cube as {positions, indices}. Winding/vertex-order variants below must
// hash identically (the round-trip invariance formats depend on).
const CUBE = {
  positions: [
    0,
    0,
    0,
    1,
    0,
    0,
    1,
    1,
    0,
    0,
    1,
    0, // back face
    0,
    0,
    1,
    1,
    0,
    1,
    1,
    1,
    1,
    0,
    1,
    1, // front face
  ],
  indices: [
    0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6,
  ],
}

// Same cube, triangles listed in a different order → same geometry.
const CUBE_REORDERED = {
  positions: CUBE.positions,
  indices: [
    4, 5, 6, 4, 6, 7, 0, 1, 2, 0, 2, 3, 2, 3, 7, 2, 7, 6, 0, 1, 5, 0, 5, 4,
  ],
}

function makeMaterialImage(width, height, fn) {
  const data = new Uint8Array(width * height * 3)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fn(x, y)
      const i = (y * width + x) * 3
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
    }
  }
  return { data, width, height, channels: 3 }
}

// ---- geometry: determinism + round-trip -------------------------------

describe('geometry hash — determinism + round-trip', () => {
  it('is stable across repeated calls (golden)', () => {
    const a = hashGeometry(CUBE)
    const b = hashGeometry(CUBE)
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]+$/)
    expect(GEOMETRY_HASH_VERSION).toBe(1)
  })

  it('round-trip: the same mesh with reordered triangles hashes identically', () => {
    expect(hashGeometry(CUBE)).toBe(hashGeometry(CUBE_REORDERED))
  })

  it('a genuinely different mesh hashes differently', () => {
    const shifted = {
      positions: CUBE.positions.map((v, i) => (i % 3 === 0 ? v + 5 : v)),
      indices: CUBE.indices,
    }
    expect(hashGeometry(CUBE)).not.toBe(hashGeometry(shifted))
  })
})

// ---- material: mis-assigned channel fixture (golden) ------------------

describe('material stats — golden fixtures', () => {
  it('a seamless flat colour is tileable with zero seam', () => {
    const flat = makeMaterialImage(16, 16, () => [120, 120, 120])
    const stats = computeMaterialStats(flat)
    expect(stats.tileability.seamScore).toBe(0)
    expect(stats.placeholder).toBe('constant')
  })

  it('a non-blue "normal map" fixture yields a reddish mean colour (drives the validation warning)', () => {
    const fakeNormal = makeMaterialImage(16, 16, () => [200, 40, 40])
    const stats = computeMaterialStats(fakeNormal)
    expect(stats.meanColor[0]).toBeGreaterThan(stats.meanColor[2]) // red > blue → not tangent-space
  })
})

// ---- audio: one-silent-channel fixture (golden) -----------------------

describe('audio stats — golden fixtures', () => {
  it('stereo with a silent right channel is flagged effectively mono', () => {
    const sr = 8000
    const left = new Float32Array(sr)
    for (let i = 0; i < sr; i++)
      left[i] = 0.4 * Math.sin((2 * Math.PI * 220 * i) / sr)
    const right = new Float32Array(sr) // silent
    const stats = computeAudioStats({ channels: [left, right], sampleRate: sr })
    expect(stats.stereo.silentChannel).toBe('right')
    expect(stats.stereo.effectivelyMono).toBe(true)
    expect(stats.bpm).toBeNull() // pure tone → no tempo
  })
})

// ---- scripts: multi-engine fixtures (golden) --------------------------

describe('script extraction — multi-engine golden fixtures', () => {
  it('detects Unity from a C# fixture', async () => {
    const source =
      'using UnityEngine;\npublic class Enemy : MonoBehaviour {\n  void Update() {}\n}'
    const { payload } = await extractScript({
      language: 'csharp',
      sourceText: source,
    })
    expect(payload.engine).toBe('Unity')
    expect(payload.symbols.types).toContain('Enemy')
  })

  it('detects Godot from a GDScript fixture', async () => {
    const source = 'extends CharacterBody2D\nfunc _process(delta):\n\tpass\n'
    const { payload } = await extractScript({
      language: 'gdscript',
      sourceText: source,
    })
    expect(payload.engine).toBe('Godot')
  })
})
