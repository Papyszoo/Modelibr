import dotenv from 'dotenv';
import { config, validateConfig } from './config.js';
import logger from './logger.js';
import { JobProcessor } from './jobProcessor.js';
import { HealthServer } from './healthServer.js';

// Load environment variables
dotenv.config();

/**
 * Main application class
 */
class ThumbnailWorkerApp {
  constructor() {
    this.jobProcessor = null;
    this.healthServer = null;
    this.isShuttingDown = false;
  }

  /**
   * Initialize and start the application
   */
  async start() {
    try {
      logger.info('Starting Modelibr Thumbnail Worker Service', {
        version: process.env.npm_package_version || '1.0.0',
        nodeVersion: process.version,
        workerId: config.workerId
      });

      // Validate configuration
      validateConfig();
      logger.info('Configuration validated successfully');

      // Log configuration (excluding sensitive data)
      logger.info('Worker configuration', {
        workerId: config.workerId,
        pollIntervalMs: config.pollIntervalMs,
        maxConcurrentJobs: config.maxConcurrentJobs,
        rendering: config.rendering,
        healthcheck: config.healthcheck,
        apiBaseUrl: config.apiBaseUrl
      });

      // Initialize job processor
      this.jobProcessor = new JobProcessor();
      
      // Initialize health server
      this.healthServer = new HealthServer(this.jobProcessor);

      // Setup graceful shutdown handlers
      this.setupShutdownHandlers();

      // Start health server first
      await this.healthServer.start();

      // Start job processor
      await this.jobProcessor.start();

      logger.info('Thumbnail worker service started successfully');

    } catch (error) {
      logger.error('Failed to start thumbnail worker service', {
        error: error.message,
        stack: error.stack
      });
      process.exit(1);
    }
  }

  /**
   * Gracefully shutdown the application
   */
  async shutdown() {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    logger.info('Starting graceful shutdown');

    try {
      // Stop accepting new jobs first
      if (this.jobProcessor) {
        await this.jobProcessor.shutdown();
      }

      // Stop health server
      if (this.healthServer) {
        await this.healthServer.stop();
      }

      logger.info('Graceful shutdown completed');
      process.exit(0);

    } catch (error) {
      logger.error('Error during shutdown', {
        error: error.message,
        stack: error.stack
      });
      process.exit(1);
    }
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  setupShutdownHandlers() {
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];

    signals.forEach(signal => {
      process.on(signal, () => {
        logger.info(`Received ${signal}, initiating graceful shutdown`);
        this.shutdown();
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', {
        error: error.message,
        stack: error.stack
      });
      this.shutdown();
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection', {
        reason: reason,
        promise: promise
      });
      this.shutdown();
    });
  }
}

// Start the application
const app = new ThumbnailWorkerApp();
app.start().catch(error => {
  console.error('Failed to start application:', error);
  process.exit(1);
});