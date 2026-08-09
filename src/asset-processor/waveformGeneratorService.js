import { createCanvas } from '@napi-rs/canvas'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import logger from './logger.js'

const execFileAsync = promisify(execFile)

/**
 * Service for generating waveform images from audio files
 * Uses ffmpeg to extract audio data and canvas to render waveform visualization
 */
export class WaveformGeneratorService {
  constructor() {
    this.waveformWidth = 800
    this.waveformHeight = 150
    this.waveColor = '#3b82f6' // Blue color matching frontend
    this.backgroundColor = 'rgba(0, 0, 0, 0.05)'
  }

  /**
   * Generate waveform image from audio file
   * @param {string} audioFilePath - Path to the audio file
   * @param {string} outputPath - Path where waveform image should be saved
   * @param {object} options - Generation options
   * @returns {Promise<{peaks: number[], duration: number}>} Peaks data and duration
   */
  async generateWaveform(audioFilePath, outputPath, options = {}) {
    const width = options.width || this.waveformWidth
    const height = options.height || this.waveformHeight
    const waveColor = options.waveColor || this.waveColor

    try {
      logger.info('Starting waveform generation', {
        audioFile: path.basename(audioFilePath),
        outputPath: path.basename(outputPath),
        width,
        height,
      })

      // Step 1: Extract audio metadata (duration, sample rate, channels, format)
      const { duration, sampleRate, channels, format } =
        await this.getAudioMetadata(audioFilePath)
      logger.debug('Audio metadata extracted', {
        duration,
        sampleRate,
        channels,
        format,
      })

      // Step 2: Extract peaks data from audio
      const peaks = await this.extractPeaks(audioFilePath, 200)
      logger.debug('Peaks extracted', { peakCount: peaks.length })

      // Step 3: Render waveform to canvas
      const canvas = await this.renderWaveformToCanvas(
        peaks,
        width,
        height,
        waveColor
      )

      // Step 4: Convert canvas to PNG buffer
      const buffer = canvas.toBuffer('image/png')

      // Step 5: Optimize with sharp and save
      await sharp(buffer)
        .png({ quality: 90, compressionLevel: 9 })
        .toFile(outputPath)

      logger.info('Waveform generation completed', {
        outputPath: path.basename(outputPath),
        fileSize: (await fs.stat(outputPath)).size,
      })

      return {
        peaks,
        duration,
        sampleRate,
        channels,
        format,
      }
    } catch (error) {
      logger.error('Waveform generation failed', {
        audioFile: path.basename(audioFilePath),
        error: error.message,
      })
      throw error
    }
  }

  /**
   * Extract audio metadata using a single ffprobe JSON probe.
   * Duration is required (the waveform job cannot complete without it); the
   * sample rate / channels / format fields are best-effort and degrade to null
   * when the probe omits them so a partial probe never fails the job.
   * @param {string} audioFilePath - Path to audio file
   * @returns {Promise<{duration: number, sampleRate: number|null, channels: number|null, format: string|null}>}
   */
  async getAudioMetadata(audioFilePath) {
    let probe
    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v',
        'error',
        '-select_streams',
        'a:0',
        '-show_entries',
        'format=duration,format_name:stream=sample_rate,channels',
        '-of',
        'json',
        audioFilePath,
      ])
      probe = JSON.parse(stdout)
    } catch (error) {
      logger.error('Failed to probe audio metadata', { error: error.message })
      throw new Error(`Failed to probe audio metadata: ${error.message}`)
    }

    const duration = parseFloat(probe?.format?.duration)
    if (isNaN(duration) || duration <= 0) {
      throw new Error(
        `Invalid duration from ffprobe: ${probe?.format?.duration}`
      )
    }

    const stream = Array.isArray(probe?.streams) ? probe.streams[0] : undefined
    const sampleRate = this._parsePositiveInt(stream?.sample_rate)
    const channels = this._parsePositiveInt(stream?.channels)
    // format_name can be a comma-separated list (e.g. "mov,mp4,m4a,..."); keep the first token.
    const format =
      typeof probe?.format?.format_name === 'string'
        ? probe.format.format_name.split(',')[0].trim().toLowerCase() || null
        : null

    return { duration, sampleRate, channels, format }
  }

  /**
   * Parse a value to a positive integer, returning null on failure.
   * @param {unknown} value
   * @returns {number|null}
   */
  _parsePositiveInt(value) {
    const parsed = parseInt(value, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }

  /**
   * Extract audio peaks using ffmpeg
   * @param {string} audioFilePath - Path to audio file
   * @param {number} numPeaks - Number of peaks to extract
   * @returns {Promise<number[]>} Array of normalized peak values (-1 to 1)
   */
  async extractPeaks(audioFilePath, numPeaks = 200) {
    const tempPcmFile = path.join(
      path.dirname(audioFilePath),
      `temp_${Date.now()}.pcm`
    )

    try {
      // Extract mono PCM data at 8kHz (good for waveform visualization)
      await execFileAsync('ffmpeg', [
        '-i',
        audioFilePath,
        '-f',
        's16le',
        '-ac',
        '1',
        '-ar',
        '8000',
        tempPcmFile,
        '-y',
      ])

      // Read PCM data
      const pcmData = await fs.readFile(tempPcmFile)

      // Convert to 16-bit samples
      const samples = new Int16Array(
        pcmData.buffer,
        pcmData.byteOffset,
        pcmData.length / 2
      )

      // Calculate peaks
      const peaks = this.calculatePeaks(samples, numPeaks)

      return peaks
    } catch (error) {
      logger.error('Failed to extract peaks', { error: error.message })
      throw new Error(`Failed to extract peaks: ${error.message}`)
    } finally {
      // Clean up temp file
      try {
        await fs.unlink(tempPcmFile)
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Calculate peak values from audio samples
   * @param {Int16Array} samples - Audio samples
   * @param {number} numPeaks - Number of peaks to calculate
   * @returns {number[]} Normalized peak values (-1 to 1)
   */
  calculatePeaks(samples, numPeaks) {
    const peaks = []
    const samplesPerPeak = Math.floor(samples.length / numPeaks)

    for (let i = 0; i < numPeaks; i++) {
      const start = i * samplesPerPeak
      const end = Math.min(start + samplesPerPeak, samples.length)
      let max = 0

      // Find maximum absolute value in this chunk
      for (let j = start; j < end; j++) {
        const abs = Math.abs(samples[j])
        if (abs > max) {
          max = abs
        }
      }

      // Normalize to -1 to 1 range
      peaks.push(max / 32768.0)
    }

    return peaks
  }

  /**
   * Render waveform to canvas
   * @param {number[]} peaks - Peak values
   * @param {number} width - Canvas width
   * @param {number} height - Canvas height
   * @param {string} waveColor - Wave color
   * @returns {Canvas} Canvas with rendered waveform
   */
  renderWaveformToCanvas(peaks, width, height, waveColor) {
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')

    // Fill background
    ctx.fillStyle = this.backgroundColor
    ctx.fillRect(0, 0, width, height)

    // Calculate bar width and gap
    const barWidth = Math.max(2, Math.floor(width / peaks.length))
    const barGap = 1
    const effectiveBarWidth = barWidth - barGap

    // Draw waveform bars
    ctx.fillStyle = waveColor

    const centerY = height / 2

    for (let i = 0; i < peaks.length; i++) {
      const x = i * barWidth
      const peak = peaks[i]

      // Calculate bar height (from center)
      const barHeight = peak * (height / 2) * 0.9 // 90% of half height

      // Draw bar (centered vertically)
      ctx.fillRect(x, centerY - barHeight, effectiveBarWidth, barHeight * 2)
    }

    return canvas
  }

  /**
   * Decode PCM and compute deterministic audio content/quality statistics for the
   * extraction substrate (peak/rms/DC/clipping, head/tail silence, single-channel-
   * in-stereo, null BPM on non-musical content). The maths lives in the pure
   * `audioStats.js`; this method only does the ffmpeg decode.
   *
   * Preserves the SOURCE channel layout (no remix) so a real mono file is not
   * mistaken for "two identical channels". Analysis is bounded to the first
   * `maxSeconds` to cap memory on long files.
   *
   * @param {string} audioFilePath
   * @param {{channels?: number|null, maxSeconds?: number}} [options]
   * @returns {Promise<Object|null>} audioStats payload, or null if decode failed.
   */
  async extractAudioStats(audioFilePath, options = {}) {
    const analysisRate = 22050
    const maxSeconds = options.maxSeconds ?? 120
    // Fall back to a probe when the caller didn't pass channel count.
    let channels = options.channels
    if (!channels || channels < 1) {
      try {
        channels = (await this.getAudioMetadata(audioFilePath)).channels
      } catch {
        channels = null
      }
    }
    const ch = channels && channels > 0 ? channels : 1

    const args = [
      '-v',
      'error',
      '-t',
      String(maxSeconds),
      '-i',
      audioFilePath,
      '-f',
      'f32le',
      '-acodec',
      'pcm_f32le',
      '-ac',
      String(ch), // == source channels, so no up/down-mix
      '-ar',
      String(analysisRate),
      'pipe:1',
    ]

    let pcm
    try {
      const { stdout } = await execFileAsync('ffmpeg', args, {
        encoding: 'buffer',
        maxBuffer: 256 * 1024 * 1024,
      })
      pcm = stdout
    } catch (error) {
      logger.warn('Audio PCM decode failed for stats', { error: error.message })
      return null
    }

    if (!pcm || pcm.length < 4) return null

    const { computeAudioStats } = await import('./audioStats.js')
    const f32 = new Float32Array(
      pcm.buffer,
      pcm.byteOffset,
      Math.floor(pcm.length / 4)
    )
    const frames = Math.floor(f32.length / ch)
    const channelBuffers = Array.from(
      { length: ch },
      () => new Float32Array(frames)
    )
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < ch; c++) channelBuffers[c][i] = f32[i * ch + c]
    }

    const stats = computeAudioStats({
      channels: channelBuffers,
      sampleRate: analysisRate,
    })
    if (stats && maxSeconds && frames >= maxSeconds * analysisRate) {
      stats.truncatedToSeconds = maxSeconds
    }
    return stats
  }

  /**
   * Check if ffmpeg is available
   * @returns {Promise<boolean>}
   */
  async checkFFmpegAvailable() {
    try {
      await execFileAsync('ffmpeg', ['-version'])
      return true
    } catch {
      return false
    }
  }
}
