/**
 * Audio content/quality statistics - deterministic analysis over decoded PCM,
 * as pure functions so they run in the worker and are fully unit-testable without
 * shelling out to ffmpeg. The ffmpeg decode (and true LUFS / true-peak, which
 * need ITU-R BS.1770 K-weighting) live in the worker wrapper; everything here is
 * arithmetic over sample arrays.
 *
 * Convention: each channel is a Float32Array (or number[]) of samples normalised
 * to −1..1. `channels` is an array of those, `channels.length` = channel count.
 *
 * Design intent per prompt 22:
 *  - Flag the common real-world defect of single-channel content in a stereo file
 *    (one silent channel, or two identical channels).
 *  - Emit a null BPM on non-musical content rather than a plausible wrong number.
 */

export const AUDIO_STATS_VERSION = 1

function round(value, decimals = 4) {
  if (!Number.isFinite(value)) return null
  const f = 10 ** decimals
  return Math.round(value * f) / f
}

function toDb(linear) {
  if (!(linear > 0)) return null
  return round(20 * Math.log10(linear), 2)
}

/** Peak, RMS (linear + dBFS), DC offset and clipping fraction for one channel. */
export function channelLevels(samples) {
  const n = samples.length
  if (n === 0) {
    return {
      peak: null,
      peakDb: null,
      rms: null,
      rmsDb: null,
      dcOffset: null,
      clippingFraction: null,
    }
  }

  let peak = 0
  let sum = 0
  let sqSum = 0
  let clipped = 0
  for (let i = 0; i < n; i++) {
    const s = samples[i]
    const abs = Math.abs(s)
    if (abs > peak) peak = abs
    sum += s
    sqSum += s * s
    // Within 1 LSB of full scale at 16-bit ≈ 0.99997; treat >= 0.9999 as clipped.
    if (abs >= 0.9999) clipped++
  }

  const rms = Math.sqrt(sqSum / n)
  return {
    peak: round(peak),
    peakDb: toDb(peak),
    rms: round(rms),
    rmsDb: toDb(rms),
    dcOffset: round(sum / n),
    clippingFraction: round(clipped / n),
  }
}

/** Leading/trailing silence in seconds, using an amplitude threshold (dBFS). */
export function silenceEdges(samples, sampleRate, thresholdDb = -60) {
  const n = samples.length
  if (n === 0 || !sampleRate) return { headSeconds: null, tailSeconds: null }
  const threshold = 10 ** (thresholdDb / 20)

  let head = 0
  while (head < n && Math.abs(samples[head]) < threshold) head++

  let tail = 0
  while (tail < n && Math.abs(samples[n - 1 - tail]) < threshold) tail++

  return {
    headSeconds: round(head / sampleRate, 3),
    // A fully silent buffer counts entirely as head silence; don't double-count.
    tailSeconds: round(Math.min(tail, n - head) / sampleRate, 3),
  }
}

/**
 * Stereo relationship. Detects the two common "fake stereo" defects: one silent
 * channel, or two identical (or near-identical) channels.
 */
export function analyzeStereo(
  left,
  right,
  { silenceDb = -60, identicalEps = 1e-4 } = {}
) {
  const n = Math.min(left.length, right.length)
  if (n === 0) {
    return {
      identical: null,
      silentChannel: null,
      effectivelyMono: null,
      correlation: null,
    }
  }

  const silenceThreshold = 10 ** (silenceDb / 20)
  const leftPeak = channelLevels(left).peak ?? 0
  const rightPeak = channelLevels(right).peak ?? 0

  let silentChannel = null
  if (rightPeak < silenceThreshold && leftPeak >= silenceThreshold)
    silentChannel = 'right'
  else if (leftPeak < silenceThreshold && rightPeak >= silenceThreshold)
    silentChannel = 'left'

  // Max absolute per-sample difference → identical-channel detection.
  let maxDiff = 0
  let dot = 0
  let lSq = 0
  let rSq = 0
  for (let i = 0; i < n; i++) {
    const d = Math.abs(left[i] - right[i])
    if (d > maxDiff) maxDiff = d
    dot += left[i] * right[i]
    lSq += left[i] * left[i]
    rSq += right[i] * right[i]
  }
  const identical = maxDiff <= identicalEps
  const denom = Math.sqrt(lSq) * Math.sqrt(rSq)
  const correlation = denom > 0 ? round(dot / denom) : null

  return {
    identical,
    silentChannel,
    effectivelyMono: identical || silentChannel !== null,
    correlation,
  }
}

/**
 * Very rough tempo estimate from onset regularity. Returns null on non-musical
 * content (too few onsets, or irregular spacing) - the prompt explicitly prefers
 * null over a confident wrong number on a door creak or noise.
 */
export function estimateBpm(
  samples,
  sampleRate,
  { minBpm = 60, maxBpm = 200 } = {}
) {
  const n = samples.length
  if (n === 0 || !sampleRate || n < sampleRate) return null // need ≥ ~1s

  // Energy envelope over ~10ms hops.
  const hop = Math.max(1, Math.floor(sampleRate * 0.01))
  const env = []
  for (let i = 0; i < n; i += hop) {
    let e = 0
    const end = Math.min(i + hop, n)
    for (let j = i; j < end; j++) e += samples[j] * samples[j]
    env.push(Math.sqrt(e / (end - i)))
  }
  if (env.length < 8) return null

  // Onsets: positive flux above a dynamic threshold.
  const mean = env.reduce((a, b) => a + b, 0) / env.length
  let variance = 0
  for (const v of env) variance += (v - mean) ** 2
  variance /= env.length
  const std = Math.sqrt(variance)
  // A near-constant envelope (noise, drones, ambience) is not musical → bail.
  if (std < mean * 0.15 || std === 0) return null

  const threshold = mean + std * 0.5
  const onsets = []
  for (let i = 1; i < env.length; i++) {
    if (
      env[i] > threshold &&
      env[i] > env[i - 1] &&
      (onsets.length === 0 || i - onsets[onsets.length - 1] > 3)
    ) {
      onsets.push(i)
    }
  }
  if (onsets.length < 4) return null

  const intervals = []
  for (let i = 1; i < onsets.length; i++)
    intervals.push((onsets[i] - onsets[i - 1]) * hop)
  intervals.sort((a, b) => a - b)
  const medianInterval = intervals[Math.floor(intervals.length / 2)]
  if (!medianInterval) return null

  // Reject irregular spacing (mad/median too high) → not a steady beat.
  const mad =
    intervals
      .map(x => Math.abs(x - medianInterval))
      .reduce((a, b) => a + b, 0) / intervals.length
  if (mad / medianInterval > 0.25) return null

  let bpm = 60 / (medianInterval / sampleRate)
  while (bpm < minBpm) bpm *= 2
  while (bpm > maxBpm) bpm /= 2
  return round(bpm, 1)
}

/**
 * Full deterministic audio stat block from decoded channels.
 * @param {{ channels: Array<Float32Array|number[]>, sampleRate: number }} decoded
 */
export function computeAudioStats(decoded) {
  const { channels, sampleRate } = decoded
  if (!channels || channels.length === 0) return null

  const perChannel = channels.map(channelLevels)

  // Downmix to mono for content analysis (silence/bpm) - a simple average.
  const length = channels[0].length
  const mono = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    let s = 0
    for (const ch of channels) s += ch[i] || 0
    mono[i] = s / channels.length
  }

  const stats = {
    version: AUDIO_STATS_VERSION,
    sampleRate: sampleRate ?? null,
    channelCount: channels.length,
    perChannel,
    silence: silenceEdges(mono, sampleRate),
    bpm: estimateBpm(mono, sampleRate),
  }

  if (channels.length >= 2) {
    stats.stereo = analyzeStereo(channels[0], channels[1])
  }

  return stats
}
