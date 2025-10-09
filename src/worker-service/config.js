// Configuration settings for the thumbnail worker service
export const config = {
  // Server settings
  port: process.env.WORKER_PORT || 3001,
  workerId: process.env.WORKER_ID || `worker-${process.pid}`,

  // API connection settings
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:5009',
  rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',

  // Job processing settings
  maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS) || 3,

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // Thumbnail rendering settings
  rendering: {
    frameStep: parseInt(process.env.RENDER_FRAME_STEP) || 1,
    outputWidth: parseInt(process.env.RENDER_WIDTH) || 256,
    outputHeight: parseInt(process.env.RENDER_HEIGHT) || 256,
    outputFormat: process.env.RENDER_FORMAT || 'png',
    backgroundColor: process.env.RENDER_BACKGROUND || '#f0f0f0',
    cameraDistance: parseFloat(process.env.CAMERA_DISTANCE) || 5,
    enableAntialiasing: process.env.ENABLE_ANTIALIASING !== 'false',
  },

  // Orbit animation settings
  orbit: {
    angleStep: parseFloat(process.env.ORBIT_ANGLE_STEP) || 12, // degrees between each frame (360/12 = 30 frames)
    startAngle: parseFloat(process.env.ORBIT_START_ANGLE) || 0, // starting angle in degrees
    endAngle: parseFloat(process.env.ORBIT_END_ANGLE) || 360, // ending angle in degrees
    cameraHeight: parseFloat(process.env.ORBIT_CAMERA_HEIGHT) || 0, // vertical offset from center
    enabled: process.env.ORBIT_ENABLED !== 'false', // enable orbit rendering
  },

  // Model processing settings
  modelProcessing: {
    maxPolygonCount: parseInt(process.env.MAX_POLYGON_COUNT) || 1000000, // 1M polygons by default
    enableNormalization: process.env.ENABLE_NORMALIZATION !== 'false',
    normalizedScale: parseFloat(process.env.NORMALIZED_SCALE) || 2.0, // Scale to fit in a 2x2x2 cube
  },

  // Frame encoding settings
  encoding: {
    enabled: process.env.ENCODING_ENABLED !== 'false', // enable frame encoding
    framerate: parseFloat(process.env.ENCODING_FRAMERATE) || 10, // frames per second for WebP
    webpQuality: parseInt(process.env.WEBP_QUALITY) || 75, // WebP quality (0-100)
    jpegQuality: parseInt(process.env.JPEG_QUALITY) || 85, // JPEG quality for poster (0-100)
    cleanupTempFiles: process.env.CLEANUP_TEMP_FILES !== 'false', // cleanup temp files after encoding
  },

  // Thumbnail storage settings
  thumbnailStorage: {
    enabled: process.env.THUMBNAIL_STORAGE_ENABLED !== 'false', // enable thumbnail upload to API
    basePath: process.env.THUMBNAIL_STORAGE_PATH || '/tmp/thumbnails', // temp path for generated files (not used for persistent storage)
    skipDuplicates: false, // always false for API upload - backend handles deduplication
  },

  // Image classification settings
  imageClassification: {
    enabled: process.env.IMAGE_CLASSIFICATION_ENABLED !== 'false',
    minConfidence: parseFloat(process.env.CLASSIFICATION_MIN_CONFIDENCE) || 0.1,
    maxTags: parseInt(process.env.CLASSIFICATION_MAX_TAGS) || 10,
    topKPerImage: parseInt(process.env.CLASSIFICATION_TOP_K_PER_IMAGE) || 5,
  },

  // Logging settings
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
  },

  // Error handling settings
  maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
  retryDelayMs: parseInt(process.env.RETRY_DELAY_MS) || 1000,

  // Health check settings
  healthcheck: {
    enabled: process.env.HEALTHCHECK_ENABLED !== 'false',
    endpoint: process.env.HEALTHCHECK_ENDPOINT || '/health',
  },
}

// Validate configuration
export function validateConfig() {
  const errors = []

  if (config.maxConcurrentJobs < 1) {
    errors.push('MAX_CONCURRENT_JOBS must be at least 1')
  }

  if (
    config.rendering.outputWidth < 64 ||
    config.rendering.outputWidth > 2048
  ) {
    errors.push('RENDER_WIDTH must be between 64 and 2048')
  }

  if (
    config.rendering.outputHeight < 64 ||
    config.rendering.outputHeight > 2048
  ) {
    errors.push('RENDER_HEIGHT must be between 64 and 2048')
  }

  if (!['png', 'jpg', 'jpeg', 'webp'].includes(config.rendering.outputFormat)) {
    errors.push('RENDER_FORMAT must be one of: png, jpg, jpeg, webp')
  }

  if (config.rendering.cameraDistance <= 0) {
    errors.push('CAMERA_DISTANCE must be greater than 0')
  }

  if (config.orbit.angleStep <= 0 || config.orbit.angleStep > 90) {
    errors.push('ORBIT_ANGLE_STEP must be between 0 and 90 degrees')
  }

  if (config.orbit.startAngle < 0 || config.orbit.startAngle >= 360) {
    errors.push('ORBIT_START_ANGLE must be between 0 and 359 degrees')
  }

  if (
    config.orbit.endAngle <= config.orbit.startAngle ||
    config.orbit.endAngle > 360
  ) {
    errors.push(
      'ORBIT_END_ANGLE must be greater than start angle and up to 360 degrees'
    )
  }

  if (config.modelProcessing.maxPolygonCount < 1000) {
    errors.push('MAX_POLYGON_COUNT must be at least 1000')
  }

  if (config.modelProcessing.normalizedScale <= 0) {
    errors.push('NORMALIZED_SCALE must be greater than 0')
  }

  if (config.encoding.framerate <= 0 || config.encoding.framerate > 60) {
    errors.push('ENCODING_FRAMERATE must be between 0 and 60 fps')
  }

  if (config.encoding.webpQuality < 0 || config.encoding.webpQuality > 100) {
    errors.push('WEBP_QUALITY must be between 0 and 100')
  }

  if (config.encoding.jpegQuality < 0 || config.encoding.jpegQuality > 100) {
    errors.push('JPEG_QUALITY must be between 0 and 100')
  }

  if (config.thumbnailStorage.enabled && !config.thumbnailStorage.basePath) {
    errors.push(
      'THUMBNAIL_STORAGE_PATH must be specified when thumbnail storage is enabled'
    )
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`)
  }

  return true
}
