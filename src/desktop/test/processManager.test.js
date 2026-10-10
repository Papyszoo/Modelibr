import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import { ProcessManager, findLanIPv4Address, buildLanUrl } from '../src/processManager.js'
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
  // The live URL/health still point at the bound port - this is the exact bug
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

  // The literal path the default resolves to - selecting it should be a no-op,
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

function makePMWithData(base) {
  return new ProcessManager({
    runtimeDir: path.join(os.tmpdir(), 'mlbr-runtime'),
    userDataDir: base,
    config: sanitizeRuntimeConfig({ dataDirectory: path.join(base, 'data') }),
    log: () => {},
  })
}

test('clearStalePostgresLock removes a lock left by a dead process', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'mlbr-lock-'))
  try {
    const pm = makePMWithData(base)
    await fs.mkdir(pm.paths.postgresData, { recursive: true })
    const pidFile = path.join(pm.paths.postgresData, 'postmaster.pid')
    // A PID above the OS maximum → not a running process → the lock is stale.
    await fs.writeFile(pidFile, `2147483646\n${pm.paths.postgresData}\n`)

    await pm.clearStalePostgresLock()
    await assert.rejects(fs.access(pidFile), 'stale postmaster.pid should be removed')
  } finally {
    await fs.rm(base, { recursive: true, force: true })
  }
})

test('clearStalePostgresLock is a no-op when there is no lock file', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'mlbr-lock-'))
  try {
    await makePMWithData(base).clearStalePostgresLock() // must not throw
  } finally {
    await fs.rm(base, { recursive: true, force: true })
  }
})

test('web api environment needs no PostgreSQL client tools and keeps backups on', () => {
  // The regression this replaced: PG_DUMP_PATH/PSQL_PATH were advertised, and the
  // packaged runtime has no such files. Backups are now written through the same
  // driver the app already uses, so there is no tool path to point at and nothing
  // to skip.
  const pm = makePM({ postgresPort: 35432 })
  pm.markRunning()

  const env = pm.buildWebApiEnvironment()

  assert.equal('PG_DUMP_PATH' in env, false)
  assert.equal('PSQL_PATH' in env, false)
  assert.equal(env.POSTGRES_HOST, '127.0.0.1')
  assert.equal(env.POSTGRES_PORT, '35432')
  assert.equal(env.POSTGRES_DB, 'Modelibr')
  assert.equal(env.POSTGRES_USER, 'modelibr')
  assert.equal(env.POSTGRES_PASSWORD, 'modelibr')
  assert.equal(env.MODELIBR_SKIP_PREMIGRATION_BACKUP, 'false')
})

test('worker environment points scene render-back at the active UI port', () => {
  // Regression: the native host started workers without FRONTEND_URL, so
  // ?render=scene and ?render=vfx could never load the app and every scene
  // render and animated thumbnail failed - while docker-compose passed it. It
  // must follow the bound UI port (active), like API_BASE_URL follows the bound
  // API port.
  const pm = makePM({ appPort: 3010, internalApiPort: 38080 })
  pm.markRunning()

  const env = pm.buildWorkerEnvironment(0)

  assert.equal(env.FRONTEND_URL, 'http://127.0.0.1:3010')
  assert.equal(env.API_BASE_URL, 'http://127.0.0.1:38080')
  // Health port hangs off the bound API port (index 0 -> +100).
  assert.equal(env.WORKER_PORT, '38180')
})

test('worker FRONTEND_URL follows a UI port resolved away from a taken one', () => {
  const pm = makePM({ appPort: 3010 })
  pm.markRunning({ appPort: 50515 }) // 3010 was busy, bound 50515 instead

  assert.equal(
    pm.buildWorkerEnvironment(0).FRONTEND_URL,
    'http://127.0.0.1:50515'
  )
})

test('a runtime with only the server binaries passes the asset check', async () => {
  // Regression guard for the 0.6.1 desktop break: pg_dump/psql were listed as
  // required assets, so every packaged build threw "Missing runtime asset" and
  // the app refused to start. The server binaries are the whole requirement now,
  // so a runtime carrying exactly those three is a complete one.
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mlbr-runtime-'))
  const runtimeDir = path.join(root, 'runtime')
  const exe = name => (process.platform === 'win32' ? `${name}.exe` : name)
  const touch = async relative => {
    const target = path.join(runtimeDir, relative)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, '')
  }

  try {
    await touch('frontend/index.html')
    await touch(`webapi/${exe('WebApi')}`)
    await touch(`node/${exe('node')}`)
    await touch('asset-processor/index.js')
    await touch(`postgres/bin/${exe('pg_ctl')}`)
    await touch(`postgres/bin/${exe('initdb')}`)

    const pm = new ProcessManager({
      runtimeDir,
      userDataDir: path.join(root, 'userdata'),
      config: sanitizeRuntimeConfig({}),
      log: () => {},
    })

    await pm.ensureRuntimeAssets()

    const env = pm.buildWebApiEnvironment()
    // Boot did not throw, and the WebApi is told to keep taking pre-migration
    // backups - a runtime that cannot back up is no longer a state that exists.
    assert.equal(env.MODELIBR_SKIP_PREMIGRATION_BACKUP, 'false')
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('the desktop marks the WebApi as native so it binds loopback only', () => {
  // Regression: the desktop launched the WebApi with ListenAnyIP, so its private
  // (unauthenticated) port was reachable from the LAN even with network access
  // off. The marker is what makes the WebApi bind localhost; Docker never sets it.
  const pm = makePM()
  pm.markRunning()

  assert.equal(pm.buildWebApiEnvironment().MODELIBR_DESKTOP, 'true')
})

test('the desktop marks workers as native so their health servers bind loopback only', () => {
  // Same regression, worker side: the asset-processor health server (health,
  // status, metrics) was listening on every interface, so the desktop's private
  // ports were reachable from the LAN with network access off. The marker makes
  // it bind 127.0.0.1; Docker never sets it.
  const pm = makePM()
  pm.markRunning()

  assert.equal(pm.buildWorkerEnvironment(0).MODELIBR_DESKTOP, 'true')
})

test('findLanIPv4Address returns the first non-internal IPv4 interface', () => {
  const interfaces = {
    lo0: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
    en0: [{ family: 'IPv6', address: 'fe80::1', internal: false }],
    en1: [
      { family: 'IPv4', address: '192.168.1.63', internal: false },
      { family: 'IPv4', address: '10.0.0.5', internal: false },
    ],
  }

  assert.equal(findLanIPv4Address(interfaces), '192.168.1.63')
  // Loopback-only (offline / IPv6-only) yields nothing rather than a dead URL.
  assert.equal(
    findLanIPv4Address({
      lo0: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
    }),
    null
  )
})

test('buildLanUrl builds the address a LAN device uses, or null when there is none', () => {
  assert.equal(
    buildLanUrl(3010, {
      en0: [{ family: 'IPv4', address: '192.168.1.63', internal: false }],
    }),
    'http://192.168.1.63:3010'
  )
  assert.equal(
    buildLanUrl(3010, {
      lo0: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
    }),
    null
  )
})

test('probeStatus advertises the LAN URL only when network access is on', async () => {
  // Regression: the status window never told the user what to type on another
  // device. It must appear only while the opt-in is on, and must match the host
  // helper so the window and the tray agree.
  const off = makePM({ appPort: 3010, allowNetworkAccess: false })
  off.markRunning()
  assert.equal((await off.probeStatus()).lanFrontendUrl, null)

  const on = makePM({ appPort: 3010, allowNetworkAccess: true })
  on.markRunning()
  assert.equal((await on.probeStatus()).lanFrontendUrl, buildLanUrl(3010))
})
