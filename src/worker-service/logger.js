import winston from 'winston'
import { config } from './config.js'

// Create logger instance with structured logging
const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
    config.logging.format === 'json'
      ? winston.format.json()
      : winston.format.simple()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
})

// Add request ID tracking for better traceability
export function withRequestId(requestId) {
  return logger.child({ requestId })
}

// Add job context logging
export function withJobContext(jobId, modelId) {
  return logger.child({ jobId, modelId })
}

export default logger
