import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import { ProcessManager } from '../src/processManager.js'
import { sanitizeRuntimeConfig } from '../src/runtimeConfig.js'
import { readMigrationMarker } from '../src/dataMigration.js'

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

test('setting the data folder to the default-resolved path is not a pending restart', () => {
  const userDataDir = path.join(os.tmpdir(), 'mlbr-userdata-default')
  const pm = new ProcessManager({
    runtimeDir: path.join(os.tmpdir(), 'mlbr-runtime'),
    userDataDir,
    config: sanitizeRuntimeConfig({}), // dataDirectory '' → default location
    log: () => {},
  })
  pm.markRunning()

  // The literal path the default resolves to — selecting it should be a no-op,
  // not a spurious "restart required" (raw '' vs the absolute path differ).
  const resolvedDefault = path.join(userDataDir, 'data')
  pm.updateConfig(sanitizeRuntimeConfig({ ...pm.config, dataDirectory: resolvedDefault }))

  assert.equal(pm.hasPendingRestart(), false)
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

test('an auto-resolved port is reported as active but is NOT a pending restart', () => {
  // start() resolves a taken port to a free one and records it via
  // markRunning({ appPort: <free> }); the saved config keeps the preference.
  const pm = makePM({ appPort: 3010 })
  pm.markRunning({ appPort: 50515 }) // 3010 was busy, bound 50515 instead

  // The window shows the port that's actually listening...
  assert.equal(pm.buildRuntimeSnapshot().publicAppUrl, 'http://127.0.0.1:50515')
  // ...but the user changed nothing, so no restart is pending...
  assert.equal(pm.hasPendingRestart(), false)
  // ...and their saved preference is untouched (tried again next launch).
  assert.equal(pm.config.appPort, 3010)
})

test('scheduleDataMigrationIfNeeded records a move when the data folder changes', async () => {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mlbr-pm-'))
  try {
    const pm = new ProcessManager({
      runtimeDir: path.join(os.tmpdir(), 'mlbr-runtime'),
      userDataDir,
      config: sanitizeRuntimeConfig({}), // default data folder
      log: () => {},
    })
    pm.markRunning()
    const activeRoot = pm.paths.data

    const newRoot = path.join(os.tmpdir(), 'mlbr-relocated')
    pm.updateConfig(sanitizeRuntimeConfig({ ...pm.config, dataDirectory: newRoot }))
    await pm.scheduleDataMigrationIfNeeded()
    assert.deepEqual(await readMigrationMarker(userDataDir), { from: activeRoot, to: newRoot })

    // Changing it back to the running folder cancels the queued move.
    pm.updateConfig(sanitizeRuntimeConfig({ ...pm.config, dataDirectory: '' }))
    await pm.scheduleDataMigrationIfNeeded()
    assert.equal(await readMigrationMarker(userDataDir), null)
  } finally {
    await fs.rm(userDataDir, { recursive: true, force: true })
  }
})
