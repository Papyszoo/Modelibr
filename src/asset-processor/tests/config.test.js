import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('config', () => {
  let originalEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
    vi.resetModules()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should load default config values', async () => {
    const { config } = await import('../config.js')

    expect(config.port).toBeDefined()
    expect(config.apiBaseUrl).toBe('http://localhost:8080')
    expect(config.rendering.outputWidth).toBe(256)
    expect(config.rendering.outputHeight).toBe(256)
    expect(config.orbit.enabled).toBe(true)
    expect(config.encoding.enabled).toBe(true)
  })

  it('should throw on invalid config values', async () => {
    const { config, validateConfig } = await import('../config.js')

    // Set invalid values
    const originalWidth = config.rendering.outputWidth
    config.rendering.outputWidth = 32

    expect(() => validateConfig()).toThrow('RENDER_WIDTH')

    // Restore
    config.rendering.outputWidth = originalWidth
  })

  it('should accept valid config without errors', async () => {
    const { validateConfig } = await import('../config.js')
    const result = validateConfig()
    expect(result).toBe(true)
  })
})
