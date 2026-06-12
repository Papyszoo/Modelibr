import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import {
  DEFAULT_RUNTIME_CONFIG,
  RESTART_REQUIRED_KEYS,
  requiresRestart,
  sanitizeRuntimeConfig,
  loadRuntimeConfig,
  saveRuntimeConfig,
} from '../src/runtimeConfig.js'

function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'modelibr-cfg-'))
}

test('sanitize clamps out-of-range ports to their bounds', () => {
  const cfg = sanitizeRuntimeConfig({
    appPort: 99, // below min
    internalApiPort: 999999, // above max
    postgresPort: 'not-a-number',
  })
  assert.equal(cfg.appPort, 1024)
  assert.equal(cfg.internalApiPort, 65535)
  assert.equal(cfg.postgresPort, DEFAULT_RUNTIME_CONFIG.postgresPort)
})

test('sanitize only honors absolute data directories', () => {
  assert.equal(sanitizeRuntimeConfig({ dataDirectory: 'relative/dir' }).dataDirectory, '')
  assert.equal(sanitizeRuntimeConfig({ dataDirectory: '   ' }).dataDirectory, '')
  const abs = path.join(os.tmpdir(), 'mlbr-data')
  assert.equal(sanitizeRuntimeConfig({ dataDirectory: abs }).dataDirectory, abs)
})

test('hardware acceleration is opt-in (true / "true" only)', () => {
  assert.equal(sanitizeRuntimeConfig({ enableHardwareAcceleration: true }).enableHardwareAcceleration, true)
  assert.equal(sanitizeRuntimeConfig({ enableHardwareAcceleration: 'true' }).enableHardwareAcceleration, true)
  assert.equal(sanitizeRuntimeConfig({ enableHardwareAcceleration: 'yes' }).enableHardwareAcceleration, false)
  assert.equal(sanitizeRuntimeConfig({}).enableHardwareAcceleration, false)
})

test('network access is opt-in (true / "true" only) and needs a restart', () => {
  assert.equal(sanitizeRuntimeConfig({}).allowNetworkAccess, false)
  assert.equal(sanitizeRuntimeConfig({ allowNetworkAccess: true }).allowNetworkAccess, true)
  assert.equal(sanitizeRuntimeConfig({ allowNetworkAccess: 'true' }).allowNetworkAccess, true)
  assert.equal(sanitizeRuntimeConfig({ allowNetworkAccess: 'yes' }).allowNetworkAccess, false)
  const base = sanitizeRuntimeConfig({})
  assert.equal(requiresRestart(base, { ...base, allowNetworkAccess: true }), true)
})

test('save then load round-trips a config', async () => {
  const dir = await tempDir()
  try {
    const { config, configPath } = await loadRuntimeConfig(dir)
    assert.equal(config.appPort, DEFAULT_RUNTIME_CONFIG.appPort)

    const saved = await saveRuntimeConfig(configPath, { ...config, appPort: 4010 })
    assert.equal(saved.appPort, 4010)

    const reloaded = await loadRuntimeConfig(dir)
    assert.equal(reloaded.config.appPort, 4010)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('sequential saves persist the latest value, on disk too', async () => {
  const dir = await tempDir()
  try {
    const { config, configPath } = await loadRuntimeConfig(dir)
    let current = config
    for (const port of [4010, 5010, 6010]) {
      current = await saveRuntimeConfig(configPath, { ...current, appPort: port })
    }
    assert.equal(current.appPort, 6010)

    const onDisk = JSON.parse(await fs.readFile(configPath, 'utf8'))
    assert.equal(onDisk.appPort, 6010)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('requiresRestart flags every port and the data folder', () => {
  const base = sanitizeRuntimeConfig({})
  for (const key of RESTART_REQUIRED_KEYS) {
    const next =
      key === 'dataDirectory'
        ? { ...base, dataDirectory: path.join(os.tmpdir(), 'moved') }
        : { ...base, [key]: base[key] + 1 }
    assert.equal(requiresRestart(base, next), true, `${key} should require a restart`)
  }
})

test('requiresRestart ignores worker-only settings and no-op changes', () => {
  const base = sanitizeRuntimeConfig({})
  assert.equal(requiresRestart(base, { ...base, workerProcessCount: base.workerProcessCount + 1 }), false)
  assert.equal(
    requiresRestart(base, { ...base, maxConcurrentJobsPerWorker: base.maxConcurrentJobsPerWorker + 1 }),
    false
  )
  assert.equal(
    requiresRestart(base, { ...base, enableHardwareAcceleration: !base.enableHardwareAcceleration }),
    false
  )
  assert.equal(requiresRestart(base, { ...base }), false)
})

test('every setting survives a full save → load round-trip', async () => {
  const dir = await tempDir()
  try {
    const { configPath } = await loadRuntimeConfig(dir)
    const desired = {
      appPort: 4010,
      internalApiPort: 41000,
      postgresPort: 45432,
      workerProcessCount: 4,
      maxConcurrentJobsPerWorker: 6,
      enableHardwareAcceleration: true,
      dataDirectory: path.join(os.tmpdir(), 'mlbr-roundtrip-data'),
      allowNetworkAccess: true,
    }
    await saveRuntimeConfig(configPath, desired)

    const { config } = await loadRuntimeConfig(dir)
    for (const [key, value] of Object.entries(desired)) {
      assert.deepEqual(config[key], value, `${key} should persist`)
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})
