import { config } from './config.js'
import logger from './logger.js'

/**
 * Service to render multiple views of a 3D model for image classification
 */
export class ClassificationRenderer {
  constructor(puppeteerRenderer) {
    this.renderer = puppeteerRenderer
  }

  /**
   * Render classification views of the loaded model
   * @param {Object} jobLogger - Logger with job context
   * @returns {Promise<Array<{buffer: Buffer, view: Object}>>} Array of image buffers with view info for classification
   */
  async renderClassificationViews(jobLogger) {
    if (!this.renderer || !this.renderer.page) {
      throw new Error('Renderer not initialized')
    }

    jobLogger.info('Starting classification view rendering')

    // Define the 4 camera positions with rotation pairs (elevation, azimuth)
    // Elevation: 20 degrees, Azimuth: 30, 330, 150, 210 degrees
    const views = [
      { name: 'view1', elevation: 20, azimuth: 30 },
      { name: 'view2', elevation: 20, azimuth: 330 },
      { name: 'view3', elevation: 20, azimuth: 150 },
      { name: 'view4', elevation: 20, azimuth: 210 },
    ]

    const imageResults = []

    try {
      // Calculate optimal camera distance
      const cameraDistance =
        await this.renderer.calculateOptimalCameraDistance()

      for (const view of views) {
        const result = await this.renderer.page.evaluate(
          async (azimuth, dist, elevation) => {
            try {
              window.positionCamera(azimuth, dist, elevation)
              const rendered = await window.renderScene()

              if (!rendered) {
                return { success: false, error: 'Rendering failed' }
              }

              const dataUrl = window.getCanvasDataURL()
              if (!dataUrl) {
                return { success: false, error: 'Failed to get canvas data' }
              }

              return {
                success: true,
                dataUrl,
              }
            } catch (error) {
              console.error('Render error:', error)
              return { success: false, error: error.message }
            }
          },
          view.azimuth,
          cameraDistance,
          view.elevation
        )

        if (!result.success) {
          throw new Error(
            `Failed to render ${view.name}: ${result.error || 'Unknown error'}`
          )
        }

        // Convert data URL to buffer
        const base64Data = result.dataUrl.replace(
          /^data:image\/\w+;base64,/,
          ''
        )
        const buffer = Buffer.from(base64Data, 'base64')
        imageResults.push({
          buffer,
          view: {
            name: view.name,
            elevation: view.elevation,
            azimuth: view.azimuth,
          },
        })

        jobLogger.debug('Rendered classification view', {
          view: view.name,
          elevation: view.elevation,
          azimuth: view.azimuth,
          bufferSize: buffer.length,
        })
      }

      jobLogger.info('Classification view rendering completed', {
        imageCount: imageResults.length,
      })

      return imageResults
    } catch (error) {
      jobLogger.error('Failed to render classification views', {
        error: error.message,
        stack: error.stack,
      })
      throw error
    }
  }
}
