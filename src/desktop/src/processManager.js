import { spawn } from 'child_process'
import crypto from 'crypto'
import fs from 'fs/promises'
import http from 'http'
import https from 'https'
import os from 'os'
import path from 'path'

import { requiresRestart } from './runtimeConfig.js'
import { resolveUsablePort } from './ports.js'
import {
  readMigrationMarker,
  clearMigrationMarker,
  writeMigrationMarker,
  migrateDataDirectory,
  writeLeftoverFolder,
} from './dataMigration.js'

const POSTGRES_USER = 'modelibr'
const POSTGRES_PASSWORD = 'modelibr'
const POSTGRES_DATABASE = 'Modelibr'
const START_TIMEOUT_MS = 60000
const SHUTDOWN_TIMEOUT_MS = 15000

function platformExecutable(baseName) {
  return process.platform === 'win32' ? `${baseName}.exe` : baseName
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function ensureDirectory(targetPath) {
  await fs.mkdir(targetPath, { recursive: true })
}

function logWithPrefix(log, scope, message, details) {
  if (details === undefined) {
    log(`[ModelibrDesktop][${scope}] ${message}`)
    return
  }

  log(`[ModelibrDesktop][${scope}] ${message}`, details)
}

function requestStatus(url) {
  const target = new URL(url)
  const transport = target.protocol === 'https:' ? https : http

  return new Promise(resolve => {
    const req = transport.request(
      target,
      {
        method: 'GET',
      },
      res => {
        res.resume()
        resolve(res.statusCode ?? 0)
      }
    )

    req.on('error', () => resolve(0))
    req.end()
  })
}

async function waitForHttp(url, timeoutMs) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const status = await requestStatus(url)
    if (status >= 200 && status < 500) {
      return
    }

    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  throw new Error(`Timed out waiting for ${url}`)
}

function runCommand(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      ...options,
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', chunk => {
      stdout += chunk.toString()
    })

    child.stderr?.on('data', chunk => {
      stderr += chunk.toString()
    })

    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }

      reject(
        new Error(
          [
            `${path.basename(executable)} exited with code ${code}`,
            stdout.trim(),
            stderr.trim(),
          ]
            .filter(Boolean)
            .join('\n')
        )
      )
    })
  })
}

function createStopPromise(child, signal = 'SIGTERM') {
  return new Promise(resolve => {
    let completed = false

    const finish = () => {
      if (!completed) {
        completed = true
        resolve()
      }
    }

    const timer = setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGKILL')
      }
    }, SHUTDOWN_TIMEOUT_MS)

    child.once('exit', () => {
      clearTimeout(timer)
      finish()
    })

    try {
      child.kill(signal)
    } catch {
      clearTimeout(timer)
      finish()
    }
  })
}

export class ProcessManager {
  constructor({ runtimeDir, userDataDir, config, log = console.log }) {
    this.runtimeDir = runtimeDir
    this.userDataDir = userDataDir
    // Three views of the config:
    //   config        — the desired/saved values, shown in Settings.
    //   startedConfig — what was desired at the last successful boot; drives
    //                   "needs restart" (did the user change a restart setting
    //                   since start?), so an auto-resolved port isn't mistaken
    //                   for a pending change.
    //   activeConfig  — the ports actually bound (config, but with any port that
    //                   was taken swapped for a free one). Snapshot URLs and
    //                   health probes read this, so the "Open" button always
    //                   points at a port that's really listening.
    this.config = config
    this.startedConfig = null
    this.activeConfig = null
    this.log = log
    this.webApiProcess = null
    this.workerProcesses = []
    this.postgresControlPath = null
    this.stoppingWorkers = false
    // Shared secret the worker presents (X-Api-Key) and the WebApi validates
    // (WORKER_API_KEY) on upload endpoints. The WebApi runs as Production, where
    // an empty key is rejected as Unauthorized, so we mint a strong per-session
    // key and hand the same value to both local processes. Both bind to
    // 127.0.0.1 only, so a fresh in-memory key needs no persistence.
    this.workerApiKey = crypto.randomBytes(32).toString('hex')
    // Data root is user-configurable (config.dataDirectory); empty means the
    // default location under userData. Everything stateful lives under it so a
    // single setting relocates all data.
    const dataRoot = this.dataRootFor(config)
    this.paths = {
      data: dataRoot,
      uploads: path.join(dataRoot, 'uploads'),
      thumbnails: path.join(dataRoot, 'thumbnails'),
      restore: path.join(dataRoot, 'restore'),
      postgresData: path.join(dataRoot, 'postgres'),
      blender: path.join(dataRoot, 'blender'),
      temp: path.join(userDataDir, 'temp'),
      // PostgreSQL's Unix socket lives in a short, writable, space-free temp
      // path. The default (/var/run/postgresql) isn't writable on Linux, and
      // the userData dir can contain spaces (macOS "Application Support") which
      // pg_ctl's -o option string can't parse.
      pgSocket: path.join(os.tmpdir(), 'modelibr-postgres'),
    }
  }

  // The latest saved config (this.config) drives what Settings shows; the
  // running services are described by activeConfig. Until the first successful
  // boot captures it, fall back to the desired config.
  get runningConfig() {
    return this.activeConfig ?? this.config
  }

  // Resolves a config's absolute data root: an explicit dataDirectory, or the
  // default under userData when blank. Used so pending-restart detection can
  // compare the *resolved* paths.
  dataRootFor(config) {
    return config.dataDirectory || path.join(this.userDataDir, 'data')
  }

  updateConfig(config) {
    this.config = config
  }

  // Records that services are now running. `activePorts` carries any ports that
  // had to be swapped for a free one (see start()); everything user-visible
  // about a running service reads from activeConfig, while startedConfig is the
  // baseline for "needs restart".
  markRunning(activePorts = null) {
    this.startedConfig = { ...this.config }
    this.activeConfig = { ...this.config, ...(activePorts || {}) }
  }

  // True when the user has changed a restart-only setting (ports / data folder)
  // SINCE the last start — i.e. a relaunch would apply it. Compared against
  // startedConfig (not activeConfig) so an auto-resolved port, where active
  // already differs from desired through no user action, isn't read as pending.
  hasPendingRestart() {
    if (!this.startedConfig) {
      return false
    }
    // The data folder compares *resolved* roots, so choosing the path the
    // default already resolves to isn't a false positive. The remaining
    // restart-only keys (the ports) compare directly via the shared definition
    // — dataDirectory is zeroed on both sides so it doesn't double-count here.
    if (this.dataRootFor(this.config) !== this.dataRootFor(this.startedConfig)) {
      return true
    }
    return requiresRestart(
      { ...this.startedConfig, dataDirectory: '' },
      { ...this.config, dataDirectory: '' }
    )
  }

  buildRuntimeSnapshot() {
    const active = this.runningConfig
    return {
      ...active,
      webApiHealthUrl: `http://127.0.0.1:${active.internalApiPort}/health`,
      publicAppUrl: `http://127.0.0.1:${active.appPort}`,
      publicWebDavUrl: `http://127.0.0.1:${active.appPort}/modelibr`,
      dataDirectory: this.paths.data,
      workerHealthUrls: this.workerProcesses.map(w =>
        `http://127.0.0.1:${active.internalApiPort + 100 + w.index}/health`
      ),
      pendingRestart: this.hasPendingRestart(),
    }
  }

  // Live health snapshot consumed by the tray status window. Probes each
  // service independently so a single component being down is visible on
  // its own row rather than collapsing the whole app into "not running".
  async probeStatus() {
    // Probe and report the ports the services are actually bound to (active),
    // not the latest-saved ones — otherwise a pending port change would make
    // every service read as "down" against a port nothing is listening on yet.
    const active = this.runningConfig
    const internalApiPort = active.internalApiPort

    const backendStatusCode = await requestStatus(
      `http://127.0.0.1:${internalApiPort}/health`
    )
    const backendUp = backendStatusCode >= 200 && backendStatusCode < 500

    const databaseUp = await this.isPostgresRunning()

    const workerChecks = await Promise.all(
      this.workerProcesses.map(async worker => {
        const code = await requestStatus(
          `http://127.0.0.1:${this.getWorkerHealthPort(worker.index)}/health`
        )
        return code >= 200 && code < 500
      })
    )
    const healthyWorkers = workerChecks.filter(Boolean).length

    return {
      backend: { up: backendUp, port: internalApiPort },
      database: { up: databaseUp, port: active.postgresPort },
      assetProcessor: {
        up: healthyWorkers > 0,
        healthy: healthyWorkers,
        running: this.workerProcesses.length,
        configured: this.config.workerProcessCount,
      },
      frontendUrl: `http://127.0.0.1:${active.appPort}`,
      webDavUrl: `http://127.0.0.1:${active.appPort}/modelibr`,
      dataDirectory: this.paths.data,
      pendingRestart: this.hasPendingRestart(),
      portsAutoAdjusted: this.portsAutoAdjusted(),
    }
  }

  // True when a configured port was taken at start and we bound a free one
  // instead — lets the UI explain why the address differs from the saved port.
  portsAutoAdjusted() {
    if (!this.startedConfig || !this.activeConfig) {
      return false
    }
    return (
      this.activeConfig.appPort !== this.startedConfig.appPort ||
      this.activeConfig.internalApiPort !== this.startedConfig.internalApiPort ||
      this.activeConfig.postgresPort !== this.startedConfig.postgresPort
    )
  }

  async isPostgresRunning() {
    if (!this.postgresControlPath) {
      return false
    }

    // `pg_ctl status` exits 0 when the server is up and non-zero otherwise,
    // which runCommand surfaces as a rejection.
    try {
      await runCommand(
        this.postgresControlPath,
        ['-D', this.paths.postgresData, 'status'],
        { env: this.getPostgresEnvironment() }
      )
      return true
    } catch {
      return false
    }
  }

  async start() {
    await this.ensureRuntimeAssets()
    // If the data folder was changed last run, move the existing data into it
    // before anything touches the new location (Postgres is stopped here).
    await this.maybeMigrateData()
    await this.ensureLayout()
    // Decide the ports we'll actually bind: keep the configured one when it's
    // free, otherwise grab a free port so a clash can't block boot. Record them
    // as the running config BEFORE starting services (which read these via
    // runningConfig). The saved config keeps the user's preferred ports.
    this.markRunning({
      appPort: await resolveUsablePort(this.config.appPort),
      internalApiPort: await resolveUsablePort(this.config.internalApiPort),
      postgresPort: await resolveUsablePort(this.config.postgresPort),
    })
    await this.ensurePostgresCluster()
    await this.startPostgres()
    await this.startWebApi()
    await this.startWorkers()
  }

  // Runs the one-shot data-folder migration recorded by a previous save (see
  // scheduleDataMigrationIfNeeded). Failures are logged, not fatal, and the
  // marker is always cleared so a bad migration can't loop on every launch.
  async maybeMigrateData() {
    const marker = await readMigrationMarker(this.userDataDir)
    if (!marker) {
      return
    }
    try {
      if (marker.to === this.paths.data) {
        const moved = await migrateDataDirectory(marker.from, marker.to)
        if (moved) {
          logWithPrefix(this.log, 'data', 'Migrated data folder', marker)
          // Leave the old folder in place as a backup, and remember it so the
          // UI can offer to open it / say it's safe to delete.
          await writeLeftoverFolder(this.userDataDir, marker.from)
        }
      }
    } catch (error) {
      logWithPrefix(this.log, 'data', 'Data folder migration failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      await clearMigrationMarker(this.userDataDir)
    }
  }

  // Records (or clears) a pending data-folder migration so the next launch moves
  // existing assets/database into the newly-chosen folder. Call after saving a
  // config that may have changed the data folder.
  async scheduleDataMigrationIfNeeded() {
    const desiredRoot = this.dataRootFor(this.config)
    const activeRoot = this.paths.data
    if (desiredRoot !== activeRoot) {
      await writeMigrationMarker(this.userDataDir, activeRoot, desiredRoot)
    } else {
      await clearMigrationMarker(this.userDataDir)
    }
  }

  async stop() {
    await this.stopWorkers()
    await this.stopWebApi()
    await this.stopPostgres()
  }

  async restartWorkers() {
    await this.stopWorkers()
    await this.startWorkers()
    // Worker settings are applied live by this recycle, so they're now part of
    // what's actually running — fold them into activeConfig (ports/data folder
    // are untouched; those still require a full restart).
    if (this.activeConfig) {
      this.activeConfig.workerProcessCount = this.config.workerProcessCount
      this.activeConfig.maxConcurrentJobsPerWorker =
        this.config.maxConcurrentJobsPerWorker
      this.activeConfig.enableHardwareAcceleration =
        this.config.enableHardwareAcceleration
    }
  }

  async ensureLayout() {
    await Promise.all([
      ensureDirectory(this.paths.uploads),
      ensureDirectory(this.paths.thumbnails),
      ensureDirectory(this.paths.restore),
      ensureDirectory(this.paths.postgresData),
      ensureDirectory(this.paths.blender),
      ensureDirectory(this.paths.temp),
      ensureDirectory(this.paths.pgSocket),
    ])
  }

  async ensureRuntimeAssets() {
    const requiredPaths = [
      path.join(this.runtimeDir, 'frontend', 'index.html'),
      path.join(
        this.runtimeDir,
        'webapi',
        platformExecutable('WebApi')
      ),
      path.join(
        this.runtimeDir,
        'node',
        platformExecutable('node')
      ),
      path.join(this.runtimeDir, 'asset-processor', 'index.js'),
      path.join(
        this.runtimeDir,
        'postgres',
        'bin',
        platformExecutable('pg_ctl')
      ),
      path.join(
        this.runtimeDir,
        'postgres',
        'bin',
        platformExecutable('initdb')
      ),
    ]

    for (const requiredPath of requiredPaths) {
      if (!(await exists(requiredPath))) {
        throw new Error(`Missing runtime asset: ${requiredPath}`)
      }
    }
  }

  getPostgresEnvironment() {
    const postgresRoot = path.join(this.runtimeDir, 'postgres')
    const binDir = path.join(postgresRoot, 'bin')
    const libDir = path.join(postgresRoot, 'lib')

    // The bundled PostgreSQL ships its own shared libraries (e.g. ICU) in lib/.
    // The dynamic loader resolves them via LD_LIBRARY_PATH (Linux) / DYLD_*
    // (macOS) — PATH alone doesn't cover shared-library lookup.
    const prependLib = existing =>
      [libDir, existing].filter(Boolean).join(path.delimiter)

    return {
      ...process.env,
      PATH: [binDir, libDir, process.env.PATH].filter(Boolean).join(path.delimiter),
      LD_LIBRARY_PATH: prependLib(process.env.LD_LIBRARY_PATH),
      DYLD_LIBRARY_PATH: prependLib(process.env.DYLD_LIBRARY_PATH),
      DYLD_FALLBACK_LIBRARY_PATH: prependLib(process.env.DYLD_FALLBACK_LIBRARY_PATH),
      PGDATA: this.paths.postgresData,
    }
  }

  async ensurePostgresCluster() {
    const versionFile = path.join(this.paths.postgresData, 'PG_VERSION')
    if (await exists(versionFile)) {
      return
    }

    const initdbPath = path.join(
      this.runtimeDir,
      'postgres',
      'bin',
      platformExecutable('initdb')
    )
    const passwordFile = path.join(this.paths.temp, 'postgres-password.txt')

    await fs.writeFile(passwordFile, `${POSTGRES_PASSWORD}\n`, 'utf8')

    logWithPrefix(this.log, 'postgres', 'Initializing embedded database')

    try {
      await runCommand(
        initdbPath,
        [
          '-D',
          this.paths.postgresData,
          '-U',
          POSTGRES_USER,
          '-A',
          'scram-sha-256',
          '--pwfile',
          passwordFile,
        ],
        {
          env: this.getPostgresEnvironment(),
        }
      )
    } finally {
      await fs.rm(passwordFile, { force: true })
    }
  }

  // True if `pid` names a live process. Signal 0 only checks existence — it
  // never actually signals the process. EPERM means it exists but isn't ours.
  isPidAlive(pid) {
    try {
      process.kill(pid, 0)
      return true
    } catch (error) {
      return error?.code === 'EPERM'
    }
  }

  async readPostmasterPid(pidFile) {
    try {
      const firstLine = (await fs.readFile(pidFile, 'utf8')).split('\n')[0]?.trim()
      const pid = Number.parseInt(firstLine ?? '', 10)
      return Number.isInteger(pid) && pid > 0 ? pid : null
    } catch {
      return null
    }
  }

  // True if `pid` belongs to a process whose image looks like PostgreSQL — so we
  // can tell a real orphaned server (stop it) from a stale lock whose PID was
  // reused by something unrelated (remove the file, never signal it).
  async isPostgresProcess(pid) {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await runCommand('tasklist', [
          '/FI',
          `PID eq ${pid}`,
          '/FO',
          'CSV',
          '/NH',
        ])
        return /postgres/i.test(stdout)
      }
      const { stdout } = await runCommand('ps', ['-p', String(pid), '-o', 'comm='])
      return /postgres/i.test(stdout)
    } catch {
      return false
    }
  }

  // Recovers from an unclean previous exit (crash, force-quit, OS kill) that
  // left a postmaster.pid behind, which otherwise makes pg_ctl start fail with
  // "lock file already exists". Safe by construction: it only sends a signal
  // (via stopPostgres) to a PID it has VERIFIED is PostgreSQL, and otherwise
  // just deletes the stale lock file — never a live server's, never an
  // unrelated process's.
  async clearStalePostgresLock() {
    const pidFile = path.join(this.paths.postgresData, 'postmaster.pid')
    if (!(await exists(pidFile))) {
      return
    }

    const pid = await this.readPostmasterPid(pidFile)

    // A real leftover Postgres still holding the data dir → stop it cleanly
    // (which also removes the lock).
    if (pid != null && this.isPidAlive(pid) && (await this.isPostgresProcess(pid))) {
      logWithPrefix(this.log, 'postgres', 'Stopping a leftover database instance', { pid })
      await this.stopPostgres()
    }

    if (!(await exists(pidFile))) {
      return
    }

    // The lock lingers. Remove it only when safe: the PID is gone, or it's alive
    // but not Postgres (a reused PID). Never delete a running server's lock.
    const alive = pid != null && this.isPidAlive(pid)
    if (!alive || !(await this.isPostgresProcess(pid))) {
      logWithPrefix(this.log, 'postgres', 'Removing stale postmaster.pid', { pid })
      await fs.rm(pidFile, { force: true }).catch(() => {})
    } else {
      logWithPrefix(this.log, 'postgres', 'postmaster.pid points at a running Postgres that could not be stopped', { pid })
    }
  }

  async startPostgres() {
    this.postgresControlPath = path.join(
      this.runtimeDir,
      'postgres',
      'bin',
      platformExecutable('pg_ctl')
    )

    // Clean up a lock left by an unclean previous exit so start doesn't fail
    // with "lock file postmaster.pid already exists".
    await this.clearStalePostgresLock()

    const postgresPort = this.runningConfig.postgresPort
    logWithPrefix(this.log, 'postgres', 'Starting embedded database', {
      port: postgresPort,
    })

    // Windows builds use TCP only (no Unix socket); elsewhere point the socket
    // at a writable directory so PostgreSQL can create its lock file.
    const socketOption =
      process.platform === 'win32' ? '' : ` -k ${this.paths.pgSocket}`

    await runCommand(
      this.postgresControlPath,
      [
        '-D',
        this.paths.postgresData,
        '-w',
        '-t',
        '60',
        '-o',
        `-p ${postgresPort} -h 127.0.0.1${socketOption}`,
        'start',
      ],
      {
        env: this.getPostgresEnvironment(),
      }
    )
  }

  async stopPostgres() {
    if (!this.postgresControlPath) {
      return
    }

    try {
      await runCommand(
        this.postgresControlPath,
        // `-m fast` terminates open connections immediately; `-t 20` caps the
        // wait so a stuck client can't stretch shutdown to pg_ctl's 60s default
        // (which made a restart appear to hang for ~90s while the old instance
        // was still serving).
        ['-D', this.paths.postgresData, '-m', 'fast', '-w', '-t', '20', 'stop'],
        {
          env: this.getPostgresEnvironment(),
        }
      )
    } catch (error) {
      logWithPrefix(this.log, 'postgres', 'Database stop returned a non-zero exit code', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async startWebApi() {
    const webApiExecutable = path.join(
      this.runtimeDir,
      'webapi',
      platformExecutable('WebApi')
    )

    this.webApiProcess = spawn(webApiExecutable, [], {
      cwd: path.dirname(webApiExecutable),
      env: {
        ...process.env,
        ASPNETCORE_ENVIRONMENT: 'Production',
        DisableHttpsRedirection: 'true',
        DISABLE_HTTPS_LISTENER: 'true',
        // Bind/connect to the ports we actually resolved at start (which may be
        // a free fallback if the configured one was taken), not the raw config.
        HTTP_PORT: String(this.runningConfig.internalApiPort),
        EXPOSE_443_PORT: 'false',
        WEBDAV_HTTP_PORT: String(this.runningConfig.appPort),
        WEBDAV_PROBE_BASE_URL: `http://127.0.0.1:${this.runningConfig.appPort}`,
        WORKER_API_KEY: this.workerApiKey,
        UPLOAD_STORAGE_PATH: this.paths.uploads,
        THUMBNAIL_STORAGE_PATH: this.paths.thumbnails,
        RESTORE_STORAGE_PATH: this.paths.restore,
        BLENDER_INSTALL_PATH: this.paths.blender,
        ConnectionStrings__Default: `Host=127.0.0.1;Port=${this.runningConfig.postgresPort};Database=${POSTGRES_DATABASE};Username=${POSTGRES_USER};Password=${POSTGRES_PASSWORD};`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    this.webApiProcess.stdout?.on('data', chunk => {
      logWithPrefix(this.log, 'webapi', chunk.toString().trim())
    })

    this.webApiProcess.stderr?.on('data', chunk => {
      logWithPrefix(this.log, 'webapi', chunk.toString().trim())
    })

    this.webApiProcess.on('exit', code => {
      logWithPrefix(this.log, 'webapi', `Process exited with code ${code ?? 0}`)
      this.webApiProcess = null
    })

    await waitForHttp(
      `http://127.0.0.1:${this.runningConfig.internalApiPort}/health`,
      START_TIMEOUT_MS
    )
  }

  async stopWebApi() {
    if (!this.webApiProcess) {
      return
    }

    const currentProcess = this.webApiProcess
    this.webApiProcess = null
    await createStopPromise(currentProcess)
  }

  getWorkerHealthPort(index) {
    // Health ports hang off the port the workers were actually started with.
    return this.runningConfig.internalApiPort + 100 + index
  }

  async spawnWorker(index) {
    const nodeExecutable = path.join(this.runtimeDir, 'node', platformExecutable('node'))
    const workerScript = path.join(this.runtimeDir, 'asset-processor', 'index.js')
    const workerBaseDir = path.join(this.runtimeDir, 'asset-processor')
    const healthPort = this.getWorkerHealthPort(index)

    const proc = spawn(nodeExecutable, [workerScript], {
      cwd: workerBaseDir,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        WORKER_ID: `worker-${index + 1}`,
        WORKER_PORT: String(healthPort),
        // Target the WebApi the workers can actually reach right now (active
        // port), not a just-saved one that won't be bound until a restart — so
        // recycling workers is safe even while a port change is pending. The
        // worker-pool settings below still come from the latest saved config.
        API_BASE_URL: `http://127.0.0.1:${this.runningConfig.internalApiPort}`,
        WORKER_API_KEY: this.workerApiKey,
        MAX_CONCURRENT_JOBS: String(this.config.maxConcurrentJobsPerWorker),
        THUMBNAIL_STORAGE_PATH: this.paths.thumbnails,
        BLENDER_INSTALL_PATH: this.paths.blender,
        ENABLE_GPU_RENDERING: this.config.enableHardwareAcceleration ? 'true' : 'false',
        PUPPETEER_CACHE_DIR: path.join(workerBaseDir, '.cache', 'puppeteer'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    proc.stdout?.on('data', chunk => {
      logWithPrefix(this.log, `worker:${index + 1}`, chunk.toString().trim())
    })

    proc.stderr?.on('data', chunk => {
      logWithPrefix(this.log, `worker:${index + 1}`, chunk.toString().trim())
    })

    proc.on('exit', code => {
      logWithPrefix(this.log, `worker:${index + 1}`, `Process exited with code ${code ?? 0}`)

      const pos = this.workerProcesses.findIndex(w => w.index === index)
      if (pos !== -1) {
        this.workerProcesses.splice(pos, 1)
      }

      if (!this.stoppingWorkers) {
        logWithPrefix(this.log, `worker:${index + 1}`, 'Unexpected exit — respawning in 3 s')
        setTimeout(() => {
          this.spawnWorker(index).catch(error => {
            logWithPrefix(this.log, `worker:${index + 1}`, 'Respawn failed', {
              error: error instanceof Error ? error.message : String(error),
            })
          })
        }, 3000)
      }
    })

    this.workerProcesses.push({ index, proc })
    await waitForHttp(`http://127.0.0.1:${healthPort}/health`, START_TIMEOUT_MS)
  }

  async startWorkers() {
    for (let index = 0; index < this.config.workerProcessCount; index += 1) {
      await this.spawnWorker(index)
    }
  }

  async stopWorkers() {
    this.stoppingWorkers = true
    const workers = [...this.workerProcesses]
    this.workerProcesses = []
    await Promise.all(workers.map(w => createStopPromise(w.proc)))
    this.stoppingWorkers = false
  }
}
