import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr'
import { config } from './config.js'
import logger from './logger.js'

/**
 * SignalR-based queue service that receives real-time job notifications
 * instead of polling for jobs
 */
export class SignalRQueueService {
  constructor() {
    this.connection = null
    this.isConnected = false
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.reconnectDelayMs = 5000
    this.jobReceivedCallback = null
  }

  /**
   * Initialize and start the SignalR connection
   */
  async start() {
    try {
      this.connection = new HubConnectionBuilder()
        .withUrl(`${config.apiBaseUrl}/thumbnailJobHub`)
        .withAutomaticReconnect([0, 2000, 10000, 30000])
        .configureLogging(this._getSignalRLogLevel())
        .build()

      this._setupEventHandlers()

      await this.connection.start()
      this.isConnected = true
      this.reconnectAttempts = 0

      logger.info('Connected to SignalR thumbnail job hub', {
        apiBaseUrl: config.apiBaseUrl,
        workerId: config.workerId,
      })

      // Register this worker with the hub
      await this.connection.invoke('RegisterWorker', config.workerId)

      return true
    } catch (error) {
      logger.error('Failed to connect to SignalR hub', {
        error: error.message,
        apiBaseUrl: config.apiBaseUrl,
        workerId: config.workerId,
      })
      this.isConnected = false
      return false
    }
  }

  /**
   * Stop the SignalR connection
   */
  async stop() {
    if (this.connection) {
      try {
        if (this.isConnected) {
          await this.connection.invoke('UnregisterWorker', config.workerId)
        }
        await this.connection.stop()
        logger.info('Disconnected from SignalR thumbnail job hub')
      } catch (error) {
        logger.warn('Error during SignalR disconnect', { error: error.message })
      } finally {
        this.connection = null
        this.isConnected = false
      }
    }
  }

  /**
   * Set the callback function to handle received job notifications
   * @param {Function} callback - Function to call when a job is received
   */
  onJobReceived(callback) {
    this.jobReceivedCallback = callback
  }

  /**
   * Acknowledge that a job is being processed
   * @param {number} jobId - The job ID
   * @param {string} workerId - The worker ID
   */
  async acknowledgeJob(jobId, workerId) {
    if (this.isConnected && this.connection) {
      try {
        await this.connection.invoke(
          'AcknowledgeJobProcessing',
          jobId,
          workerId
        )
      } catch (error) {
        logger.warn('Failed to acknowledge job processing', {
          jobId,
          workerId,
          error: error.message,
        })
      }
    }
  }

  /**
   * Setup SignalR event handlers
   * @private
   */
  _setupEventHandlers() {
    // Handle job enqueued notifications
    this.connection.on('JobEnqueued', jobNotification => {
      logger.debug('Received job enqueued notification', {
        jobId: jobNotification.JobId,
        modelId: jobNotification.ModelId,
        modelHash: jobNotification.ModelHash,
      })

      if (this.jobReceivedCallback) {
        // Transform the notification to match the expected job format
        const job = {
          id: jobNotification.JobId,
          modelId: jobNotification.ModelId,
          modelHash: jobNotification.ModelHash,
          status: jobNotification.Status,
          attemptCount: jobNotification.AttemptCount,
          createdAt: jobNotification.CreatedAt,
        }

        this.jobReceivedCallback(job)
      }
    })

    // Handle job status changes (for coordination with other workers)
    this.connection.on('JobStatusChanged', statusNotification => {
      logger.debug('Received job status change notification', {
        jobId: statusNotification.JobId,
        status: statusNotification.Status,
        workerId: statusNotification.WorkerId,
      })
    })

    // Handle worker registration confirmation
    this.connection.on('WorkerRegistered', confirmation => {
      logger.info('Worker registered successfully', {
        workerId: confirmation.WorkerId,
        timestamp: confirmation.Timestamp,
      })
    })

    // Handle worker unregistration confirmation
    this.connection.on('WorkerUnregistered', confirmation => {
      logger.info('Worker unregistered successfully', {
        workerId: confirmation.WorkerId,
        timestamp: confirmation.Timestamp,
      })
    })

    // Handle job acknowledgments from other workers
    this.connection.on('JobAcknowledged', acknowledgment => {
      logger.debug('Job acknowledged by worker', {
        jobId: acknowledgment.JobId,
        workerId: acknowledgment.WorkerId,
        timestamp: acknowledgment.Timestamp,
      })
    })

    // Handle connection events
    this.connection.onreconnecting(error => {
      logger.warn('SignalR connection lost, attempting to reconnect', {
        error: error?.message,
      })
      this.isConnected = false
    })

    this.connection.onreconnected(connectionId => {
      logger.info('SignalR connection restored', {
        connectionId,
        workerId: config.workerId,
      })
      this.isConnected = true
      this.reconnectAttempts = 0

      // Re-register worker after reconnection
      this.connection.invoke('RegisterWorker', config.workerId).catch(error => {
        logger.error('Failed to re-register worker after reconnection', {
          error: error.message,
        })
      })
    })

    this.connection.onclose(error => {
      logger.error('SignalR connection closed', {
        error: error?.message,
        workerId: config.workerId,
      })
      this.isConnected = false

      // Attempt manual reconnection if not already handled by automatic reconnect
      if (!this.connection.connectionId) {
        this._scheduleReconnect()
      }
    })
  }

  /**
   * Schedule a manual reconnection attempt
   * @private
   */
  _scheduleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      const delay = this.reconnectDelayMs * Math.pow(2, this.reconnectAttempts)
      this.reconnectAttempts++

      logger.info('Scheduling SignalR reconnection attempt', {
        attempt: this.reconnectAttempts,
        delayMs: delay,
        maxAttempts: this.maxReconnectAttempts,
      })

      setTimeout(async () => {
        try {
          await this.start()
        } catch (error) {
          logger.error('Manual reconnection attempt failed', {
            attempt: this.reconnectAttempts,
            error: error.message,
          })
        }
      }, delay)
    } else {
      logger.error('Max reconnection attempts reached, giving up', {
        maxAttempts: this.maxReconnectAttempts,
      })
    }
  }

  /**
   * Convert config log level to SignalR log level
   * @private
   */
  _getSignalRLogLevel() {
    switch (config.logLevel?.toLowerCase()) {
      case 'debug':
        return LogLevel.Debug
      case 'info':
        return LogLevel.Information
      case 'warn':
        return LogLevel.Warning
      case 'error':
        return LogLevel.Error
      default:
        return LogLevel.Information
    }
  }

  /**
   * Check if the service is connected
   */
  get connected() {
    return this.isConnected && this.connection?.connectionId
  }
}
