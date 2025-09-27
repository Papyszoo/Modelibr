import { SignalRQueueService } from './signalrQueueService.js'
import { config } from './config.js'
import logger from './logger.js'

/**
 * Simple test script to verify SignalR connectivity
 */
async function testSignalRConnection() {
  logger.info('Testing SignalR connection to thumbnail job hub')
  
  const queueService = new SignalRQueueService()
  
  // Set up job received callback
  queueService.onJobReceived((job) => {
    logger.info('Received job notification via SignalR', {
      jobId: job.id,
      modelId: job.modelId,
      modelHash: job.modelHash,
    })
  })
  
  try {
    // Test connection
    const connected = await queueService.start()
    
    if (connected) {
      logger.info('SignalR connection test successful!')
      
      // Keep connection alive for 10 seconds to test
      await new Promise(resolve => setTimeout(resolve, 10000))
      
    } else {
      logger.error('SignalR connection test failed')
    }
    
  } catch (error) {
    logger.error('SignalR connection test error', { error: error.message })
  } finally {
    await queueService.stop()
    logger.info('SignalR connection test completed')
    process.exit(0)
  }
}

// Run test if this script is executed directly
if (process.argv[1].endsWith('test-signalr.js')) {
  testSignalRConnection()
}