import { describe, it, expect, beforeEach } from 'vitest'

import { config, refreshBlenderConfigFromApi } from '../config.js'

// Snapshot defaults so each test starts from a clean slate.
const originalBlender = { ...config.blender }
const originalTimeout = config.blenderOperationTimeoutMs

beforeEach(() => {
  Object.assign(config.blender, originalBlender)
  config.blenderOperationTimeoutMs = originalTimeout
})

/** Build a mock apiClient matching the JobApiClient shape used by the function under test. */
function makeApiClient(handler) {
  return {
    apiClient: {
      get: handler,
    },
  }
}

describe('refreshBlenderConfigFromApi', () => {
  it('applies path and enabled from the settings endpoint', async () => {
    const apiClient = makeApiClient(async () => ({
      data: { blenderPath: '/opt/blender', enableBlender: true },
    }))

    await refreshBlenderConfigFromApi(apiClient)

    expect(config.blender.path).toBe('/opt/blender')
    expect(config.blender.enabled).toBe(true)
  })

  it('applies the operation timeout the user chose', async () => {
    const apiClient = makeApiClient(async () => ({
      data: { operationTimeoutMs: 1800000 },
    }))

    await refreshBlenderConfigFromApi(apiClient)

    expect(config.blenderOperationTimeoutMs).toBe(1800000)
  })

  it('keeps the env-derived timeout when the payload omits it', async () => {
    config.blenderOperationTimeoutMs = 900000
    const apiClient = makeApiClient(async () => ({
      data: { blenderPath: 'blender', enableBlender: false },
    }))

    await refreshBlenderConfigFromApi(apiClient)

    expect(config.blenderOperationTimeoutMs).toBe(900000)
  })

  it('ignores a non-positive timeout', async () => {
    config.blenderOperationTimeoutMs = 900000
    const apiClient = makeApiClient(async () => ({
      data: { operationTimeoutMs: 0 },
    }))

    await refreshBlenderConfigFromApi(apiClient)

    expect(config.blenderOperationTimeoutMs).toBe(900000)
  })

  it('ignores a non-numeric timeout', async () => {
    config.blenderOperationTimeoutMs = 900000
    const apiClient = makeApiClient(async () => ({
      data: { operationTimeoutMs: 'soon' },
    }))

    await refreshBlenderConfigFromApi(apiClient)

    expect(config.blenderOperationTimeoutMs).toBe(900000)
  })

  it('leaves config untouched when the API call rejects', async () => {
    config.blender.path = 'blender'
    config.blender.enabled = false
    config.blenderOperationTimeoutMs = 600000

    const apiClient = makeApiClient(async () => {
      throw new Error('Network unreachable')
    })

    await refreshBlenderConfigFromApi(apiClient)

    expect(config.blender.path).toBe('blender')
    expect(config.blender.enabled).toBe(false)
    expect(config.blenderOperationTimeoutMs).toBe(600000)
  })
})
