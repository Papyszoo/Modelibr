import { ThumbnailProcessor } from './thumbnailProcessor.js'
import { SoundProcessor } from './soundProcessor.js'
import { MeshAnalysisProcessor } from './meshProcessor.js'
import logger from '../logger.js'

/**
 * Registry that maps job asset types to their processor instances.
 * Implements the Strategy Pattern — the job queue delegates to the correct
 * processor without knowing the processing details.
 *
 * To add a new processor:
 *   1. Create a class extending BaseProcessor in processors/
 *   2. Register it here in the constructor
 *   3. Ensure the API sends the matching assetType value
 */
export class ProcessorRegistry {
  constructor() {
    /** @type {Map<string, import('./baseProcessor.js').BaseProcessor>} */
    this.processors = new Map()

    // Register built-in processors
    this.register('Model', new ThumbnailProcessor())
    this.register('Sound', new SoundProcessor())
    // MeshAnalysis is registered but not yet functional
    this.register('MeshAnalysis', new MeshAnalysisProcessor())

    logger.info('Processor registry initialized', {
      registeredTypes: Array.from(this.processors.keys()),
      blenderEnabled: process.env.BLENDER_ENABLED === 'true',
    })
  }

  /**
   * Register a processor for a given asset type.
   * @param {string} assetType - The asset type key (matches job.assetType from API).
   * @param {import('./baseProcessor.js').BaseProcessor} processor - The processor instance.
   */
  register(assetType, processor) {
    this.processors.set(assetType, processor)
  }

  /**
   * Look up the processor for a job based on its assetType.
   * @param {Object} job - The job object.
   * @returns {import('./baseProcessor.js').BaseProcessor|null} The matching processor, or null.
   */
  getProcessor(job) {
    const processor = this.processors.get(job.assetType)
    if (!processor) {
      logger.warn('No processor registered for asset type', {
        assetType: job.assetType,
        jobId: job.id,
        registeredTypes: Array.from(this.processors.keys()),
      })
      return null
    }
    return processor
  }

  /**
   * Clean up all registered processors (called during shutdown).
   */
  async cleanupAll() {
    for (const [assetType, processor] of this.processors) {
      try {
        await processor.cleanup()
        logger.debug('Processor cleaned up', { assetType })
      } catch (error) {
        logger.warn('Error cleaning up processor', {
          assetType,
          error: error.message,
        })
      }
    }
  }
}
