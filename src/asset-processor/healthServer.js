import express from 'express'
import { config } from './config.js'
import logger from './logger.js'

/**
 * Health check server for monitoring
 */
export class HealthServer {
  constructor(jobProcessor) {
    this.app = express()
    this.jobProcessor = jobProcessor
    this.server = null
    this.startTime = new Date()

    this.setupRoutes()
  }

  /**
   * Setup health check routes
   */
  setupRoutes() {
    // Basic health check
    this.app.get(config.healthcheck.endpoint, (req, res) => {
      const status = this.jobProcessor.getStatus()
      const uptime = Date.now() - this.startTime.getTime()

      const health = {
        status: status.isShuttingDown ? 'shutting-down' : 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(uptime / 1000), // seconds
        worker: {
          id: config.workerId,
          activeJobs: status.activeJobs,
          isShuttingDown: status.isShuttingDown,
        },
        configuration: {
          rendering: {
            outputWidth: config.rendering.outputWidth,
            outputHeight: config.rendering.outputHeight,
            outputFormat: config.rendering.outputFormat,
          },
        },
        version: process.env.npm_package_version || '1.0.0',
      }

      const httpStatus = status.isShuttingDown ? 503 : 200
      res.status(httpStatus).json(health)
    })

    // Detailed status endpoint
    this.app.get('/status', (req, res) => {
      const status = this.jobProcessor.getStatus()
      const memoryUsage = process.memoryUsage()

      const detailedStatus = {
        service: 'modelibr-asset-processor',
        status: status.isShuttingDown ? 'shutting-down' : 'running',
        timestamp: new Date().toISOString(),
        startTime: this.startTime.toISOString(),
        uptime: Math.floor((Date.now() - this.startTime.getTime()) / 1000),
        worker: status,
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          pid: process.pid,
          memory: {
            rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
            heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
            heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
            external: Math.round(memoryUsage.external / 1024 / 1024), // MB
          },
        },
        configuration: config,
      }

      res.json(detailedStatus)
    })

    // Ready endpoint for container orchestration
    this.app.get('/ready', (req, res) => {
      const status = this.jobProcessor.getStatus()

      if (status.isShuttingDown) {
        res.status(503).json({ ready: false, reason: 'shutting-down' })
      } else {
        res.json({ ready: true, workerId: config.workerId })
      }
    })

    // Metrics endpoint (basic)
    this.app.get('/metrics', (req, res) => {
      const status = this.jobProcessor.getStatus()
      const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000)

      // Simple Prometheus-style metrics
      const metrics = [
        `# HELP worker_uptime_seconds Total uptime of the worker`,
        `# TYPE worker_uptime_seconds counter`,
        `worker_uptime_seconds ${uptime}`,
        '',
        `# HELP worker_active_jobs Current number of active jobs`,
        `# TYPE worker_active_jobs gauge`,
        `worker_active_jobs ${status.activeJobs}`,
        '',
        `# HELP worker_is_shutting_down Whether the worker is shutting down`,
        `# TYPE worker_is_shutting_down gauge`,
        `worker_is_shutting_down ${status.isShuttingDown ? 1 : 0}`,
      ].join('\n')

      res.set('Content-Type', 'text/plain; charset=utf-8')
      res.send(metrics)
    })

    // Error handling middleware
    this.app.use((err, req, res, _next) => {
      logger.error('Health server error', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
      })

      res.status(500).json({
        error: 'Internal server error',
        timestamp: new Date().toISOString(),
      })
    })
  }

  /**
   * Start the health server
   */
  async start() {
    if (!config.healthcheck.enabled) {
      logger.info('Health check server disabled')
      return
    }

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(config.port, err => {
        if (err) {
          logger.error('Failed to start health server', { error: err.message })
          reject(err)
        } else {
          logger.info('Health server started', {
            port: config.port,
            endpoints: [
              config.healthcheck.endpoint,
              '/status',
              '/ready',
              '/metrics',
            ],
          })
          resolve()
        }
      })
    })
  }

  /**
   * Stop the health server
   */
  async stop() {
    if (!this.server) {
      return
    }

    return new Promise(resolve => {
      this.server.close(() => {
        logger.info('Health server stopped')
        resolve()
      })
    })
  }
}
