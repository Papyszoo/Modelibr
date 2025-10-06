#!/usr/bin/env node
/**
 * Simple test to verify WebGL context creation with headless-gl
 */
import createGl from 'gl'
import logger from './logger.js'

logger.info('Testing WebGL context creation...')
logger.info('DISPLAY environment variable:', { display: process.env.DISPLAY })

try {
  // Try to create a WebGL context
  const width = 256
  const height = 256
  logger.info('Attempting to create GL context...', { width, height })

  const glContext = createGl(width, height, {
    preserveDrawingBuffer: true,
    antialias: true,
    alpha: true,
  })

  if (!glContext) {
    logger.error(
      'Failed to create WebGL context - createGl returned null/undefined'
    )
    process.exit(1)
  }

  logger.info('GL context created successfully!', {
    vendor: glContext.getParameter(glContext.VENDOR),
    renderer: glContext.getParameter(glContext.RENDERER),
    version: glContext.getParameter(glContext.VERSION),
  })

  process.exit(0)
} catch (error) {
  logger.error('Exception while creating GL context:', {
    error: error.message,
    stack: error.stack,
  })
  process.exit(1)
}
