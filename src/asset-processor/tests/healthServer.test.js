import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../config.js', () => ({
  config: {
    port: 3099,
    workerId: 'test-worker',
    healthcheck: {
      enabled: true,
      endpoint: '/health',
    },
    rendering: {
      outputWidth: 256,
      outputHeight: 256,
      outputFormat: 'png',
    },
  },
}))

const { HealthServer } = await import('../healthServer.js')

describe('HealthServer', () => {
  let healthServer
  const mockJobProcessor = {
    getStatus: vi.fn().mockReturnValue({
      isShuttingDown: false,
      activeJobs: 0,
      queueSize: 0,
      isProcessingQueue: false,
      workerId: 'test-worker',
      signalrConnected: true,
    }),
  }

  beforeEach(() => {
    healthServer = new HealthServer(mockJobProcessor)
  })

  afterEach(async () => {
    if (healthServer.server) {
      await new Promise(resolve => healthServer.server.close(resolve))
    }
  })

  it('should create an express app with health routes', () => {
    expect(healthServer.app).toBeDefined()
  })

  it('should have job processor reference', () => {
    expect(healthServer.jobProcessor).toBe(mockJobProcessor)
  })

  it('should track start time', () => {
    expect(healthServer.startTime).toBeInstanceOf(Date)
  })
})
