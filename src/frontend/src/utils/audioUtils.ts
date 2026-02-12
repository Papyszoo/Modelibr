/**
 * Audio utility functions for decoding, slicing, and encoding audio data.
 * Used for waveform visualization and drag-to-DAW export functionality.
 */

/**
 * Decode an audio file into an AudioBuffer using Web Audio API.
 */
export async function decodeAudio(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer()
  const audioContext = new (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext)()

  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    return audioBuffer
  } finally {
    await audioContext.close()
  }
}

/**
 * Extract peak data from an AudioBuffer for waveform visualization.
 * Returns an array of peak values between -1 and 1.
 */
export function extractPeaks(
  audioBuffer: AudioBuffer,
  numPeaks: number = 200
): number[] {
  const channelData = audioBuffer.getChannelData(0) // Use first channel
  const peaks: number[] = []
  const samplesPerPeak = Math.floor(channelData.length / numPeaks)

  for (let i = 0; i < numPeaks; i++) {
    const start = i * samplesPerPeak
    const end = Math.min(start + samplesPerPeak, channelData.length)

    let max = 0
    for (let j = start; j < end; j++) {
      const absValue = Math.abs(channelData[j])
      if (absValue > max) {
        max = absValue
      }
    }
    peaks.push(max)
  }

  return peaks
}

/**
 * Slice an AudioBuffer to create a new buffer from a specific time range.
 */
export function sliceAudioBuffer(
  buffer: AudioBuffer,
  startTime: number,
  endTime: number
): AudioBuffer {
  const sampleRate = buffer.sampleRate
  const startSample = Math.floor(startTime * sampleRate)
  const endSample = Math.floor(endTime * sampleRate)
  const length = endSample - startSample
  const numberOfChannels = buffer.numberOfChannels

  const audioContext = new (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext)()

  try {
    const newBuffer = audioContext.createBuffer(
      numberOfChannels,
      length,
      sampleRate
    )

    for (let channel = 0; channel < numberOfChannels; channel++) {
      const oldData = buffer.getChannelData(channel)
      const newData = newBuffer.getChannelData(channel)
      for (let i = 0; i < length; i++) {
        newData[i] = oldData[startSample + i]
      }
    }

    return newBuffer
  } finally {
    audioContext.close()
  }
}

/**
 * Encode an AudioBuffer to a WAV file Blob.
 * Creates a standard RIFF/WAV file with PCM data.
 */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const bitsPerSample = 16
  const bytesPerSample = bitsPerSample / 8
  const blockAlign = numChannels * bytesPerSample
  const numSamples = buffer.length

  const dataLength = numSamples * blockAlign
  const bufferLength = 44 + dataLength // WAV header is 44 bytes

  const arrayBuffer = new ArrayBuffer(bufferLength)
  const view = new DataView(arrayBuffer)

  // RIFF header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, bufferLength - 8, true) // File size - 8
  writeString(view, 8, 'WAVE')

  // fmt chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // Chunk size
  view.setUint16(20, 1, true) // Audio format (PCM)
  view.setUint16(22, numChannels, true) // Number of channels
  view.setUint32(24, sampleRate, true) // Sample rate
  view.setUint32(28, sampleRate * blockAlign, true) // Byte rate
  view.setUint16(32, blockAlign, true) // Block align
  view.setUint16(34, bitsPerSample, true) // Bits per sample

  // data chunk
  writeString(view, 36, 'data')
  view.setUint32(40, dataLength, true) // Data size

  // Interleave channels and write PCM data
  const offset = 44
  const channels: Float32Array[] = []
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i))
  }

  let pos = offset
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]))
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff
      view.setInt16(pos, intSample, true)
      pos += 2
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' })
}

/**
 * Helper function to write a string to a DataView.
 */
function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}

/**
 * Get audio duration from a File without fully decoding.
 * Uses audio element for efficiency.
 */
export function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio()
    audio.preload = 'metadata'

    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(audio.src)
      resolve(audio.duration)
    }

    audio.onerror = () => {
      URL.revokeObjectURL(audio.src)
      reject(new Error('Failed to load audio metadata'))
    }

    audio.src = URL.createObjectURL(file)
  })
}

/**
 * Format duration in seconds to mm:ss format.
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Supported audio file extensions.
 */
export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a']

/**
 * Check if a file is a valid audio file.
 */
export function isAudioFile(file: File): boolean {
  if (file.type.startsWith('audio/')) return true
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  return AUDIO_EXTENSIONS.includes(ext)
}

/**
 * Filter an array of files to only include valid audio files.
 */
export function filterAudioFiles(files: File[]): File[] {
  return files.filter(isAudioFile)
}

/**
 * Process an audio file to extract duration and peaks.
 * Returns the processed audio metadata.
 */
export async function processAudioFile(
  file: File
): Promise<{ duration: number; peaks: string }> {
  const audioBuffer = await decodeAudio(file)
  const duration = audioBuffer.duration
  const peaks = extractPeaks(audioBuffer)
  return { duration, peaks: JSON.stringify(peaks) }
}
