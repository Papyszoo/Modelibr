// Test if dotenv.config() causes issues when .env doesn't exist
import dotenv from 'dotenv'

console.log('Before dotenv.config()')
const result = dotenv.config()
console.log('After dotenv.config()', result)
console.log('NODE_ENV:', process.env.NODE_ENV)

// Simulate logger setup
import winston from 'winston'

const config = {
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json'
  }
}

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

logger.info('Test log message', { test: 'data' })
console.log('Done')
