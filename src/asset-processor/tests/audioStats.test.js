import { describe, it, expect } from 'vitest'
import {
  channelLevels,
  silenceEdges,
  analyzeStereo,
  estimateBpm,
  computeAudioStats,
  AUDIO_STATS_VERSION,
} from '../audioStats.js'

const SR = 8000

function sine(freq, seconds, sampleRate = SR, amp = 0.5) {
  const n = Math.floor(seconds * sampleRate)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++)
    out[i] = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate)
  return out
}

function noise(seconds, sampleRate = SR, amp = 0.5) {
  const n = Math.floor(seconds * sampleRate)
  const out = new Float32Array(n)
  let seed = 12345
  for (let i = 0; i < n; i++) {
    // Deterministic LCG so the test is stable.
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    out[i] = ((seed / 0x7fffffff) * 2 - 1) * amp
  }
  return out
}

// Regular click train: an impulse every `periodSec` → a clear tempo.
function clickTrain(bpm, seconds, sampleRate = SR) {
  const n = Math.floor(seconds * sampleRate)
  const out = new Float32Array(n)
  const period = Math.floor((60 / bpm) * sampleRate)
  for (let i = 0; i < n; i += period) {
    for (let k = 0; k < 40 && i + k < n; k++) out[i + k] = 0.9 * (1 - k / 40)
  }
  return out
}

describe('channelLevels', () => {
  it('measures peak, rms and clipping', () => {
    const s = new Float32Array([1.0, -1.0, 0.5, -0.5])
    const r = channelLevels(s)
    expect(r.peak).toBe(1)
    expect(r.peakDb).toBe(0)
    expect(r.clippingFraction).toBe(0.5) // two of four at full scale
    expect(r.rms).toBeGreaterThan(0)
  })

  it('detects DC offset', () => {
    const s = new Float32Array(100).fill(0.2)
    expect(channelLevels(s).dcOffset).toBeCloseTo(0.2, 4)
  })
})

describe('silenceEdges', () => {
  it('measures leading and trailing silence', () => {
    const n = SR // 1 second
    const s = new Float32Array(n)
    // 0.25s silence, 0.5s tone, 0.25s silence.
    const tone = sine(440, 0.5)
    s.set(tone, Math.floor(0.25 * SR))
    const edges = silenceEdges(s, SR)
    expect(edges.headSeconds).toBeCloseTo(0.25, 1)
    expect(edges.tailSeconds).toBeCloseTo(0.25, 1)
  })
})

describe('analyzeStereo - fake-stereo detection', () => {
  it('flags a silent right channel', () => {
    const left = sine(440, 1)
    const right = new Float32Array(left.length) // silent
    const r = analyzeStereo(left, right)
    expect(r.silentChannel).toBe('right')
    expect(r.effectivelyMono).toBe(true)
  })

  it('flags two identical channels', () => {
    const left = sine(440, 1)
    const right = Float32Array.from(left)
    const r = analyzeStereo(left, right)
    expect(r.identical).toBe(true)
    expect(r.effectivelyMono).toBe(true)
    expect(r.correlation).toBeCloseTo(1, 2)
  })

  it('treats genuine stereo as not mono', () => {
    const left = sine(440, 1)
    const right = sine(660, 1)
    const r = analyzeStereo(left, right)
    expect(r.identical).toBe(false)
    expect(r.silentChannel).toBeNull()
    expect(r.effectivelyMono).toBe(false)
  })
})

describe('estimateBpm - null on non-musical', () => {
  it('returns null for white noise', () => {
    expect(estimateBpm(noise(2), SR)).toBeNull()
  })

  it('returns null for a steady tone (no onsets)', () => {
    expect(estimateBpm(sine(440, 2), SR)).toBeNull()
  })

  it('estimates a plausible tempo for a regular click train', () => {
    const bpm = estimateBpm(clickTrain(120, 4), SR)
    expect(bpm).not.toBeNull()
    // Octave-folding tolerated; just require it to land in a musical range.
    expect(bpm).toBeGreaterThanOrEqual(60)
    expect(bpm).toBeLessThanOrEqual(200)
  })
})

describe('computeAudioStats', () => {
  it('bundles per-channel + stereo + silence + bpm', () => {
    const left = sine(440, 1)
    const right = new Float32Array(left.length)
    const stats = computeAudioStats({ channels: [left, right], sampleRate: SR })
    expect(stats.version).toBe(AUDIO_STATS_VERSION)
    expect(stats.channelCount).toBe(2)
    expect(stats.perChannel).toHaveLength(2)
    expect(stats.stereo.silentChannel).toBe('right')
    expect(stats.bpm).toBeNull() // pure tone
  })

  it('returns null when there are no channels', () => {
    expect(computeAudioStats({ channels: [], sampleRate: SR })).toBeNull()
  })
})
