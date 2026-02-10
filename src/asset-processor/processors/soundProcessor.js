import { BaseProcessor } from './baseProcessor.js'
import { SoundFileService } from '../soundFileService.js'
import { WaveformGeneratorService } from '../waveformGeneratorService.js'
import { ThumbnailApiService } from '../thumbnailApiService.js'

/**
 * Processor for generating sound waveform thumbnails.
 * Handles: file download → waveform rendering → upload.
 */
export class SoundProcessor extends BaseProcessor {
  constructor() {
    super()
    this.soundFileService = new SoundFileService()
    this.waveformGenerator = new WaveformGeneratorService()
    this.thumbnailApiService = new ThumbnailApiService()
  }

  get processorType() {
    return 'sound-waveform'
  }

  /**
   * Process a sound waveform job.
   * @param {Object} job - The job to process.
   * @param {Object} jobLogger - Logger with job context.
   * @returns {Promise<Object>} Waveform metadata { waveformPath, sizeBytes }.
   */
  async process(job, jobLogger) {
    let tempFilePath = null

    try {
      jobLogger.info('Starting sound waveform processing', {
        soundId: job.soundId,
        soundHash: job.soundHash,
      })

      // Step 1: Fetch sound file
      jobLogger.info('Fetching sound file from API')
      const fileInfo = await this.soundFileService.fetchSoundFile(job.soundId)
      tempFilePath = fileInfo.filePath

      jobLogger.info('Sound file fetched', {
        originalFileName: fileInfo.originalFileName,
        fileType: fileInfo.fileType,
      })

      // Step 2: Generate waveform PNG
      jobLogger.info('Generating waveform thumbnail')
      const tempOutputPath = `${tempFilePath}.waveform.png`
      const { peaks, duration } = await this.waveformGenerator.generateWaveform(
        tempFilePath,
        tempOutputPath,
        {
          width: 800,
          height: 150,
          peakCount: 200,
          color: '#3b82f6',
        }
      )

      jobLogger.info('Waveform generated', {
        duration,
        peakCount: peaks.length,
      })

      // Step 3: Upload waveform thumbnail
      jobLogger.info('Uploading waveform thumbnail')
      const uploadResult = await this.thumbnailApiService.uploadSoundWaveform(
        job.soundId,
        tempOutputPath,
        job.soundHash
      )

      if (!uploadResult.success) {
        throw new Error(
          `Failed to upload waveform thumbnail: ${uploadResult.error}`
        )
      }

      jobLogger.info('Waveform uploaded', {
        storagePath: uploadResult.storagePath,
        sizeBytes: uploadResult.sizeBytes,
      })

      return {
        waveformPath: uploadResult.storagePath,
        sizeBytes: uploadResult.sizeBytes,
      }
    } finally {
      if (tempFilePath) {
        this.soundFileService.cleanupFile(tempFilePath)
        this.soundFileService.cleanupFile(`${tempFilePath}.waveform.png`)
      }
    }
  }

  /**
   * Override completion to use sound-specific API endpoint.
   */
  async markCompleted(job, result) {
    await this.jobService.finishSoundJob(job.id, true, result)
  }

  /**
   * Override failure to use sound-specific API endpoint.
   */
  async markFailed(job, errorMessage) {
    await this.jobService.finishSoundJob(job.id, false, {}, errorMessage)
  }
}
