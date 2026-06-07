import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import { ProcessManager } from '../src/processManager.js'
import { loadRuntimeConfig, saveRuntimeConfig } from '../src/runtimeConfig.js'

// Mirrors the main-process `modelibr:save-config` handler closely enough to
// exercise the full save → persist → pending-restart flow end to end, without
// Electron. This is the regression guard for "I changed the port twice, the app
// shows the new one but only the old one works".
async function saveConfig(pm, configPath, patch) {
  const previous = pm.config
  const saved = await saveRuntimeConfig(configPath, { ...previous, ...patch })
  pm.updateConfig(saved)
  return { restartRequired: pm.hasPendingRestart(), config: saved }
}

function makePM(userDataDir, config) {
  return new ProcessManager({
    runtimeDir: path.join(os.tmpdir(), 'mlbr-runtime'),
    userDataDir,
    config,
    log: () => {},
  })
}

test('multiple config changes persist and only go live after a relaunch', async () => {
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'modelibr-flow-'))
  try {
    const { config, configPath } = await loadRuntimeConfig(userData)
    const originalAppUrl = `http://127.0.0.1:${config.appPort}`

    let pm = makePM(userData, config)
    pm.markRunning() // services booted on the defaults

    // Change #1: app port.
    let result = await saveConfig(pm, configPath, { appPort: 4010 })
    assert.equal(result.restartRequired, true)
    assert.equal(pm.buildRuntimeSnapshot().publicAppUrl, originalAppUrl)

    // Change #2: database port — still pending, still serving the original port.
    result = await saveConfig(pm, configPath, { postgresPort: 45432 })
    assert.equal(result.restartRequired, true)
    assert.equal(pm.buildRuntimeSnapshot().publicAppUrl, originalAppUrl)

    // Both changes hit disk.
    const onDisk = JSON.parse(await fs.readFile(configPath, 'utf8'))
    assert.equal(onDisk.appPort, 4010)
    assert.equal(onDisk.postgresPort, 45432)

    // Relaunch: a fresh process loads the persisted config and binds the new
    // ports — this is what Electron's app.relaunch() effectively does.
    const reloaded = await loadRuntimeConfig(userData)
    pm = makePM(userData, reloaded.config)
    pm.markRunning()

    const snap = pm.buildRuntimeSnapshot()
    assert.equal(snap.publicAppUrl, 'http://127.0.0.1:4010')
    assert.equal(snap.postgresPort, 45432)
    assert.equal(snap.pendingRestart, false)
  } finally {
    await fs.rm(userData, { recursive: true, force: true })
  }
})

test('a worker-only change reports no pending restart through the save flow', async () => {
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'modelibr-flow-'))
  try {
    const { config, configPath } = await loadRuntimeConfig(userData)
    const pm = makePM(userData, config)
    pm.markRunning()

    const result = await saveConfig(pm, configPath, { maxConcurrentJobsPerWorker: config.maxConcurrentJobsPerWorker + 1 })
    assert.equal(result.restartRequired, false)

    const onDisk = JSON.parse(await fs.readFile(configPath, 'utf8'))
    assert.equal(onDisk.maxConcurrentJobsPerWorker, config.maxConcurrentJobsPerWorker + 1)
  } finally {
    await fs.rm(userData, { recursive: true, force: true })
  }
})
