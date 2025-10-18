import { pipeline, env } from '@xenova/transformers'
import logger from '../logger.js'
import path from 'path'
import { fileURLToPath } from 'url'
import { writeFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Set cache directory to use pre-downloaded models
const cacheDir = path.join(__dirname, '..', '.model-cache')
env.cacheDir = cacheDir

/**
 * Local BLIP image captioning tagger using Transformers.js
 * Runs completely offline with no external API calls
 * Uses pre-downloaded models from .model-cache directory
 * Uses ONNX Runtime for cross-platform compatibility (works on macOS, Linux, Windows)
 */
export class HuggingFaceTagger {
  constructor() {
    this.captioner = null
    this.isInitialized = false
    this.modelLoadTimeMs = 0
  }

  /**
   * Initialize the local BLIP model
   */
  async initialize() {
    if (this.isInitialized) {
      return
    }

    try {
      logger.info('Loading local BLIP image captioning model...', {
        cacheDir,
      })
      const startTime = Date.now()

      // Load BLIP model from local cache (pre-downloaded during npm install)
      // Model is cached in .model-cache directory (~200MB)
      // Uses ONNX Runtime - much lighter than TensorFlow.js
      this.captioner = await pipeline(
        'image-to-text',
        'Xenova/vit-gpt2-image-captioning'
      )

      this.modelLoadTimeMs = Date.now() - startTime
      this.isInitialized = true

      logger.info('Local BLIP model loaded successfully', {
        loadTimeMs: this.modelLoadTimeMs,
        model: 'Xenova/vit-gpt2-image-captioning',
        note: 'Model loaded from local cache (offline)',
      })
    } catch (error) {
      logger.error('Failed to load local BLIP model', {
        error: error.message,
        stack: error.stack,
      })
      throw error
    }
  }

  /**
   * Describe an image using local BLIP model (no API calls)
   * @param {Buffer} imageBuffer - Image data as Buffer
   * @param {number} _topK - Not used, kept for API compatibility
   * @returns {Promise<Array<{className: string, probability: number}>>}
   */
  async describeImage(imageBuffer, _topK = 5) {
    if (!this.isInitialized) {
      await this.initialize()
    }

    let tempFilePath = null

    try {
      const startTime = Date.now()

      // Write buffer to a temporary file
      // Transformers.js works best with file paths
      const tempFileName = `img-${randomUUID()}.png`
      tempFilePath = path.join(tmpdir(), tempFileName)
      await writeFile(tempFilePath, imageBuffer)

      // Run image captioning locally (offline) using the temp file path
      const result = await this.captioner(tempFilePath)

      const inferenceTime = Date.now() - startTime

      logger.debug('Image caption generated locally', {
        inferenceTimeMs: inferenceTime,
      })

      // Extract caption text from result
      let caption = ''
      if (Array.isArray(result) && result.length > 0) {
        caption = result[0].generated_text || ''
      } else if (typeof result === 'object' && result.generated_text) {
        caption = result.generated_text
      }

      // Convert caption to tag-like format
      const tags = this.extractTagsFromCaption(caption)

      // Return in format compatible with existing aggregator
      return tags.map(tag => ({
        className: tag,
        probability: 1.0,
      }))
    } catch (error) {
      logger.error('Failed to generate image caption', {
        error: error.message,
        stack: error.stack,
      })

      // Return empty array to allow job to continue
      return []
    } finally {
      // Clean up temp file
      if (tempFilePath) {
        try {
          await unlink(tempFilePath)
        } catch (unlinkError) {
          // Ignore cleanup errors
          logger.debug('Failed to clean up temp file', {
            path: tempFilePath,
            error: unlinkError.message,
          })
        }
      }
    }
  }

  /**
   * Extract meaningful tags from a caption
   * @param {string} caption - Generated caption
   * @returns {Array<string>} - Extracted tags
   */
  extractTagsFromCaption(caption) {
    if (!caption) {
      return []
    }

    // Convert to lowercase for processing
    const normalized = caption.toLowerCase()

    // Remove common articles and prepositions
    const stopWords = new Set([
      'a',
      'an',
      'the',
      'in',
      'on',
      'at',
      'of',
      'with',
      'by',
      'for',
      'to',
      'from',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'and',
      'or',
      'but',
      'nor',
      'so',
      'yet',
    ])

    // Split into words and filter
    const words = normalized
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .filter((word, index, self) => self.indexOf(word) === index) // Remove duplicates

    // Limit to reasonable number of tags
    const maxTags = 10
    return words.slice(0, maxTags)
  }

  /**
   * Cleanup resources
   */
  async dispose() {
    logger.info('Disposing local BLIP image tagger')
    this.captioner = null
    this.isInitialized = false
  }
}

// Singleton instance for reuse across jobs
let taggerInstance = null

/**
 * Get the shared tagger instance
 * @returns {HuggingFaceTagger}
 */
export function getTaggerInstance() {
  if (!taggerInstance) {
    taggerInstance = new HuggingFaceTagger()
  }
  return taggerInstance
}
