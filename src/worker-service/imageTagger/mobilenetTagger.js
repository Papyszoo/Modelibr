import logger from '../logger.js'

// Lazy-load TensorFlow to avoid startup errors if not available
let tf = null
let mobilenet = null

/**
 * Load TensorFlow modules dynamically
 */
async function loadTensorFlowModules() {
  if (tf && mobilenet) {
    return { tf, mobilenet }
  }

  try {
    tf = await import('@tensorflow/tfjs-node')
    mobilenet = await import('@tensorflow-models/mobilenet')
    return { tf, mobilenet }
  } catch (error) {
    logger.error('Failed to load TensorFlow modules', {
      error: error.message,
      stack: error.stack,
    })
    throw new Error(
      'TensorFlow modules not available. Please ensure @tensorflow/tfjs-node is properly installed.'
    )
  }
}

/**
 * MobileNet-based image tagger for classifying 3D model thumbnails
 */
export class MobilenetTagger {
  constructor() {
    this.model = null
    this.isLoading = false
  }

  /**
   * Initialize the MobileNet model (lazy loading)
   */
  async initialize() {
    if (this.model) {
      return // Already initialized
    }

    if (this.isLoading) {
      // Wait for the model to finish loading
      await this.waitForModelLoad()
      return
    }

    this.isLoading = true

    try {
      logger.info('Loading MobileNet model for image classification...')
      const startTime = Date.now()

      // Load TensorFlow modules dynamically
      const modules = await loadTensorFlowModules()
      mobilenet = modules.mobilenet

      this.model = await mobilenet.load({
        version: 2,
        alpha: 1.0, // Use full model for better accuracy
      })

      const loadTime = Date.now() - startTime
      logger.info('MobileNet model loaded successfully', {
        loadTimeMs: loadTime,
      })
    } catch (error) {
      logger.error('Failed to load MobileNet model', {
        error: error.message,
        stack: error.stack,
      })
      throw error
    } finally {
      this.isLoading = false
    }
  }

  /**
   * Wait for model to finish loading
   */
  async waitForModelLoad() {
    const maxWaitMs = 60000 // 60 seconds max wait
    const startWait = Date.now()

    while (this.isLoading && Date.now() - startWait < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    if (this.isLoading) {
      throw new Error('Timeout waiting for model to load')
    }
  }

  /**
   * Classify an image and return top predictions
   * @param {Buffer} imageBuffer - Image data as Buffer
   * @param {number} topK - Number of top predictions to return
   * @returns {Promise<Array<{className: string, probability: number}>>}
   */
  async describeImage(imageBuffer, topK = 5) {
    if (!this.model) {
      await this.initialize()
    }

    try {
      // Load TensorFlow if not already loaded
      if (!tf) {
        const modules = await loadTensorFlowModules()
        tf = modules.tf
      }

      // Decode image buffer to tensor
      const imageTensor = tf.node.decodeImage(imageBuffer, 3)

      // Run classification
      const predictions = await this.model.classify(imageTensor)

      // Clean up tensor to free memory
      imageTensor.dispose()

      // Return top K predictions
      return predictions.slice(0, topK).map(pred => ({
        className: pred.className,
        probability: pred.probability,
      }))
    } catch (error) {
      logger.error('Failed to classify image', {
        error: error.message,
        stack: error.stack,
      })
      throw error
    }
  }

  /**
   * Cleanup resources
   */
  async dispose() {
    if (this.model) {
      logger.info('Disposing MobileNet model')
      // Note: MobileNet model doesn't have a dispose method,
      // TensorFlow.js will handle cleanup automatically
      this.model = null
    }
  }
}

// Singleton instance for reuse across jobs
let taggerInstance = null

/**
 * Get the shared tagger instance
 * @returns {MobilenetTagger}
 */
export function getTaggerInstance() {
  if (!taggerInstance) {
    taggerInstance = new MobilenetTagger()
  }
  return taggerInstance
}
