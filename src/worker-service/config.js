// Configuration settings for the thumbnail worker service
export const config = {
  // Server settings
  port: process.env.WORKER_PORT || 3001,
  workerId: process.env.WORKER_ID || `worker-${process.pid}`,
  
  // API connection settings
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:5009',
  
  // Job polling settings
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS) || 5000,
  maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS) || 3,
  
  // Thumbnail rendering settings
  rendering: {
    frameStep: parseInt(process.env.RENDER_FRAME_STEP) || 1,
    outputWidth: parseInt(process.env.RENDER_WIDTH) || 256,
    outputHeight: parseInt(process.env.RENDER_HEIGHT) || 256,
    outputFormat: process.env.RENDER_FORMAT || 'png',
    backgroundColor: process.env.RENDER_BACKGROUND || '#f0f0f0',
    cameraDistance: parseFloat(process.env.CAMERA_DISTANCE) || 5,
    enableAntialiasing: process.env.ENABLE_ANTIALIASING !== 'false'
  },

  // Model processing settings
  modelProcessing: {
    maxPolygonCount: parseInt(process.env.MAX_POLYGON_COUNT) || 1000000, // 1M polygons by default
    enableNormalization: process.env.ENABLE_NORMALIZATION !== 'false',
    normalizedScale: parseFloat(process.env.NORMALIZED_SCALE) || 2.0 // Scale to fit in a 2x2x2 cube
  },
  
  // Logging settings
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json'
  },
  
  // Error handling settings
  maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
  retryDelayMs: parseInt(process.env.RETRY_DELAY_MS) || 1000,
  
  // Health check settings
  healthcheck: {
    enabled: process.env.HEALTHCHECK_ENABLED !== 'false',
    endpoint: process.env.HEALTHCHECK_ENDPOINT || '/health'
  }
};

// Validate configuration
export function validateConfig() {
  const errors = [];
  
  if (config.pollIntervalMs < 1000) {
    errors.push('POLL_INTERVAL_MS must be at least 1000ms');
  }
  
  if (config.maxConcurrentJobs < 1) {
    errors.push('MAX_CONCURRENT_JOBS must be at least 1');
  }
  
  if (config.rendering.outputWidth < 64 || config.rendering.outputWidth > 2048) {
    errors.push('RENDER_WIDTH must be between 64 and 2048');
  }
  
  if (config.rendering.outputHeight < 64 || config.rendering.outputHeight > 2048) {
    errors.push('RENDER_HEIGHT must be between 64 and 2048');
  }
  
  if (!['png', 'jpg', 'jpeg', 'webp'].includes(config.rendering.outputFormat)) {
    errors.push('RENDER_FORMAT must be one of: png, jpg, jpeg, webp');
  }
  
  if (config.rendering.cameraDistance <= 0) {
    errors.push('CAMERA_DISTANCE must be greater than 0');
  }
  
  if (config.modelProcessing.maxPolygonCount < 1000) {
    errors.push('MAX_POLYGON_COUNT must be at least 1000');
  }
  
  if (config.modelProcessing.normalizedScale <= 0) {
    errors.push('NORMALIZED_SCALE must be greater than 0');
  }
  
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
  
  return true;
}