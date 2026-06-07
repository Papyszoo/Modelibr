import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'os'
import path from 'path'

import { ProcessManager } from '../src/processManager.js'
import { sanitizeRuntimeConfig } from '../src/runtimeConfig.js'

// ProcessManager's constructor is side-effect free (no spawning, no FS writes),
// so we can exercise the desired-vs-active config model directly. markRunning()
// stands in for "a start() that finished booting on the current config".
function makePM(overrides = {}) {
  return new ProcessManager({
    runtimeDir: path.join(os.tmpdir(), 'mlbr-runtime'),
    userDataDir: path.join(os.tmpdir(), 'mlbr-userdata'),
    config: sanitizeRuntimeConfig(overrides),
    log: () => {},
  })
}

test('before start, the snapshot falls back to the desired config', () => {
  const pm = makePM({ appPort: 3010 })
  assert.equal(pm.hasPendingRestart(), false)
  assert.equal(pm.buildRuntimeSnapshot().publicAppUrl, 'http://127.0.0.1:3010')
})

test('saving a new port does NOT change the live URL until a restart', () => {
  const pm = makePM({ appPort: 3010 })
  pm.markRunning() // booted on :3010

  pm.updateConfig(sanitizeRuntimeConfig({ ...pm.config, appPort: 4010 }))

  const snap = pm.buildRuntimeSnapshot()
  // The live URL/health still point at the bound port — this is the exact bug
  // that made "Open" jump to a port nothing was serving yet.
  assert.equal(snap.publicAppUrl, 'http://127.0.0.1:3010')
  assert.equal(snap.pendingRestart, true)
  assert.equal(pm.hasPendingRestart(), true)
  // The desired config (what Settings shows) reflects the saved value.
  assert.equal(pm.config.appPort, 4010)
})

test('a relaunch (fresh PM from saved config) makes the new port live', () => {
  const relaunched = makePM({ appPort: 4010 })
  relaunched.markRunning()
  assert.equal(relaunched.buildRuntimeSnapshot().publicAppUrl, 'http://127.0.0.1:4010')
  assert.equal(relaunched.hasPendingRestart(), false)
})

test('several sequential changes accumulate but keep reporting active ports', () => {
  const pm = makePM({ appPort: 3010, internalApiPort: 38080, postgresPort: 35432 })
  pm.markRunning()

  pm.updateConfig(sanitizeRuntimeConfig({ ...pm.config, appPort: 4010 }))
  pm.updateConfig(sanitizeRuntimeConfig({ ...pm.config, postgresPort: 45432 }))
  pm.updateConfig(sanitizeRuntimeConfig({ ...pm.config, internalApiPort: 48080 }))

  const snap = pm.buildRuntimeSnapshot()
  assert.equal(snap.publicAppUrl, 'http://127.0.0.1:3010')
  assert.equal(snap.webApiHealthUrl, 'http://127.0.0.1:38080/health')
  assert.equal(snap.pendingRestart, true)

  // All three changes are captured in the desired config.
  assert.equal(pm.config.appPort, 4010)
  assert.equal(pm.config.postgresPort, 45432)
  assert.equal(pm.config.internalApiPort, 48080)
})

test('changing the data folder is pending; snapshot keeps the active path', () => {
  const dataA = path.join(os.tmpdir(), 'mlbr-data-a')
  const pm = makePM({ dataDirectory: dataA })
  pm.markRunning()
  const activePath = pm.buildRuntimeSnapshot().dataDirectory

  const dataB = path.join(os.tmpdir(), 'mlbr-data-b')
  pm.updateConfig(sanitizeRuntimeConfig({ ...pm.config, dataDirectory: dataB }))

  assert.equal(pm.hasPendingRestart(), true)
  assert.equal(pm.buildRuntimeSnapshot().dataDirectory, activePath)
  assert.equal(pm.config.dataDirectory, dataB)
})

test('worker-only changes never require a restart', () => {
  const pm = makePM({ workerProcessCount: 1, maxConcurrentJobsPerWorker: 2 })
  pm.markRunning()
  pm.updateConfig(
    sanitizeRuntimeConfig({
      ...pm.config,
      workerProcessCount: 3,
      maxConcurrentJobsPerWorker: 5,
      enableHardwareAcceleration: true,
    })
  )
  assert.equal(pm.hasPendingRestart(), false)
})

test('reverting a saved port back to the active value clears the pending restart', () => {
  const pm = makePM({ appPort: 3010 })
  pm.markRunning()
  pm.updateConfig(sanitizeRuntimeConfig({ ...pm.config, appPort: 4010 }))
  assert.equal(pm.hasPendingRestart(), true)
  pm.updateConfig(sanitizeRuntimeConfig({ ...pm.config, appPort: 3010 }))
  assert.equal(pm.hasPendingRestart(), false)
})
