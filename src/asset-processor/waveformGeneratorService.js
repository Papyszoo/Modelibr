import { createCanvas } from 'canvas'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import logger from './logger.js'

const execAsync = promisify(exec)

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

      // Step 1: Extract audio metadata (duration)
      const duration = await this.getAudioDuration(audioFilePath)
      logger.debug('Audio duration extracted', { duration })

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
   * Get audio duration using ffprobe
   * @param {string} audioFilePath - Path to audio file
   * @returns {Promise<number>} Duration in seconds
   */
  async getAudioDuration(audioFilePath) {
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioFilePath}"`
      )

      const duration = parseFloat(stdout.trim())
      if (isNaN(duration) || duration <= 0) {
        throw new Error(`Invalid duration: ${stdout}`)
      }

      return duration
    } catch (error) {
      logger.error('Failed to get audio duration', {
        error: error.message,
      })
      throw new Error(`Failed to get audio duration: ${error.message}`)
    }
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
      await execAsync(
        `ffmpeg -i "${audioFilePath}" -f s16le -ac 1 -ar 8000 "${tempPcmFile}" -y`
      )

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
   * Check if ffmpeg is available
   * @returns {Promise<boolean>}
   */
  async checkFFmpegAvailable() {
    try {
      await execAsync('ffmpeg -version')
      return true
    } catch {
      return false
    }
  }
}
