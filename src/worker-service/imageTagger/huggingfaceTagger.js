import axios from 'axios'
import logger from '../logger.js'

/**
 * Hugging Face-based image tagger using BLIP-2 for image captioning
 * This provides better descriptions than MobileNet's 1000-class classifier
 */
export class HuggingFaceTagger {
  constructor() {
    this.apiUrl =
      process.env.HF_API_URL ||
      'https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large'
    this.apiToken = process.env.HF_API_TOKEN || null
    this.isInitialized = false
    this.modelLoadTimeMs = 0
  }

  /**
   * Initialize the tagger (validates configuration)
   */
  async initialize() {
    if (this.isInitialized) {
      return
    }

    logger.info('Initializing Hugging Face image tagger', {
      modelUrl: this.apiUrl,
      hasApiToken: !!this.apiToken,
    })

    // Note: The Hugging Face API loads models on-demand
    // First request may be slow, subsequent requests are fast
    this.isInitialized = true

    logger.info('Hugging Face image tagger initialized successfully', {
      note: 'Model will be loaded on first inference request',
    })
  }

  /**
   * Describe an image using Hugging Face BLIP-2 model
   * @param {Buffer} imageBuffer - Image data as Buffer
   * @param {number} _topK - Not used, kept for API compatibility
   * @returns {Promise<Array<{className: string, probability: number}>>}
   */
  async describeImage(imageBuffer, _topK = 5) {
    if (!this.isInitialized) {
      await this.initialize()
    }

    try {
      const startTime = Date.now()

      // Configure request with optional authentication
      const headers = {
        'Content-Type': 'image/png',
      }

      if (this.apiToken) {
        headers['Authorization'] = `Bearer ${this.apiToken}`
      }

      // Call Hugging Face Inference API
      const response = await axios.post(this.apiUrl, imageBuffer, {
        headers,
        timeout: 30000, // 30 second timeout
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      })

      const inferenceTime = Date.now() - startTime

      // Track model load time on first request
      if (this.modelLoadTimeMs === 0) {
        this.modelLoadTimeMs = inferenceTime
        logger.info('Hugging Face model loaded on first request', {
          loadTimeMs: inferenceTime,
        })
      }

      // Parse response - BLIP returns an array with a single caption object
      // Example: [{ "generated_text": "a cat sitting on a table" }]
      let caption = ''

      if (Array.isArray(response.data) && response.data.length > 0) {
        caption = response.data[0].generated_text || ''
      } else if (
        typeof response.data === 'object' &&
        response.data.generated_text
      ) {
        caption = response.data.generated_text
      } else {
        logger.warn('Unexpected response format from Hugging Face API', {
          responseType: typeof response.data,
          data: response.data,
        })
        caption = ''
      }

      // Convert caption to tag-like format
      // Extract key nouns and adjectives as tags
      const tags = this.extractTagsFromCaption(caption)

      // Return in format compatible with existing aggregator
      // We use probability 1.0 since we don't have confidence scores
      return tags.map(tag => ({
        className: tag,
        probability: 1.0,
      }))
    } catch (error) {
      // Handle model loading errors (503 service unavailable)
      if (error.response?.status === 503) {
        const estimatedTime = error.response.data?.estimated_time || 20
        logger.warn('Hugging Face model is loading, may take a moment', {
          estimatedTime,
          error: error.response.data,
        })

        // For model loading, return empty result rather than failing
        // The job will be retried or will use other views
        return []
      }

      logger.error('Failed to classify image with Hugging Face', {
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        stack: error.stack,
      })

      // For other errors, return empty array to allow job to continue
      // rather than failing completely
      return []
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
    logger.info('Disposing Hugging Face image tagger')
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
