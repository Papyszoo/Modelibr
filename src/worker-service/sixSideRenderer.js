import { config } from './config.js'
import logger from './logger.js'

/**
 * Service to render 6-side views of a 3D model for image classification
 */
export class SixSideRenderer {
  constructor(puppeteerRenderer) {
    this.renderer = puppeteerRenderer
  }

  /**
   * Render 6 side views of the loaded model
   * @param {Object} jobLogger - Logger with job context
   * @returns {Promise<Array<Buffer>>} Array of 6 image buffers (front, back, left, right, top, bottom)
   */
  async renderSixSides(jobLogger) {
    if (!this.renderer || !this.renderer.page) {
      throw new Error('Renderer not initialized')
    }

    jobLogger.info('Starting 6-side view rendering for classification')

    // Define the 6 camera positions (angle, height for orbit)
    const sides = [
      { name: 'front', angle: 0, height: 0 },
      { name: 'back', angle: 180, height: 0 },
      { name: 'left', angle: 270, height: 0 },
      { name: 'right', angle: 90, height: 0 },
      { name: 'top', angle: 0, height: 2 }, // Looking down from above
      { name: 'bottom', angle: 0, height: -2 }, // Looking up from below
    ]

    const imageBuffers = []

    try {
      // Calculate optimal camera distance
      const cameraDistance =
        await this.renderer.calculateOptimalCameraDistance()

      for (const side of sides) {
        const result = await this.renderer.page.evaluate(
          async (ang, dist, height) => {
            try {
              window.positionCamera(ang, dist, height)
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
          side.angle,
          cameraDistance,
          side.height
        )

        if (!result.success) {
          throw new Error(
            `Failed to render ${side.name} view: ${result.error || 'Unknown error'}`
          )
        }

        // Convert data URL to buffer
        const base64Data = result.dataUrl.replace(
          /^data:image\/\w+;base64,/,
          ''
        )
        const buffer = Buffer.from(base64Data, 'base64')
        imageBuffers.push(buffer)

        jobLogger.debug('Rendered side view', {
          side: side.name,
          bufferSize: buffer.length,
        })
      }

      jobLogger.info('6-side view rendering completed', {
        imageCount: imageBuffers.length,
      })

      return imageBuffers
    } catch (error) {
      jobLogger.error('Failed to render 6-side views', {
        error: error.message,
        stack: error.stack,
      })
      throw error
    }
  }
}
