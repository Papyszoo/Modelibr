import { spawn } from 'child_process'
import fs from 'fs/promises'
import http from 'http'
import https from 'https'
import os from 'os'
import path from 'path'

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
    this.config = config
    this.log = log
    this.webApiProcess = null
    this.workerProcesses = []
    this.postgresControlPath = null
    this.stoppingWorkers = false
    this.paths = {
      data: path.join(userDataDir, 'data'),
      uploads: path.join(userDataDir, 'data', 'uploads'),
      thumbnails: path.join(userDataDir, 'data', 'thumbnails'),
      restore: path.join(userDataDir, 'data', 'restore'),
      postgresData: path.join(userDataDir, 'data', 'postgres'),
      blender: path.join(userDataDir, 'data', 'blender'),
      temp: path.join(userDataDir, 'temp'),
      // PostgreSQL's Unix socket lives in a short, writable, space-free temp
      // path. The default (/var/run/postgresql) isn't writable on Linux, and
      // the userData dir can contain spaces (macOS "Application Support") which
      // pg_ctl's -o option string can't parse.
      pgSocket: path.join(os.tmpdir(), 'modelibr-postgres'),
    }
  }

  updateConfig(config) {
    this.config = config
  }

  buildRuntimeSnapshot() {
    return {
      ...this.config,
      webApiHealthUrl: `http://127.0.0.1:${this.config.internalApiPort}/health`,
      publicAppUrl: `http://127.0.0.1:${this.config.appPort}`,
      publicWebDavUrl: `http://127.0.0.1:${this.config.appPort}/modelibr`,
      dataDirectory: this.paths.data,
      workerHealthUrls: this.workerProcesses.map(w =>
        `http://127.0.0.1:${this.config.internalApiPort + 100 + w.index}/health`
      ),
    }
  }

  // Live health snapshot consumed by the tray status window. Probes each
  // service independently so a single component being down is visible on
  // its own row rather than collapsing the whole app into "not running".
  async probeStatus() {
    const internalApiPort = this.config.internalApiPort

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
      database: { up: databaseUp, port: this.config.postgresPort },
      assetProcessor: {
        up: healthyWorkers > 0,
        healthy: healthyWorkers,
        running: this.workerProcesses.length,
        configured: this.config.workerProcessCount,
      },
      frontendUrl: `http://127.0.0.1:${this.config.appPort}`,
      webDavUrl: `http://127.0.0.1:${this.config.appPort}/modelibr`,
      dataDirectory: this.paths.data,
    }
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
    await this.ensureLayout()
    await this.ensureRuntimeAssets()
    await this.ensurePostgresCluster()
    await this.startPostgres()
    await this.startWebApi()
    await this.startWorkers()
  }

  async stop() {
    await this.stopWorkers()
    await this.stopWebApi()
    await this.stopPostgres()
  }

  async restartWorkers() {
    await this.stopWorkers()
    await this.startWorkers()
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

  async startPostgres() {
    this.postgresControlPath = path.join(
      this.runtimeDir,
      'postgres',
      'bin',
      platformExecutable('pg_ctl')
    )

    logWithPrefix(this.log, 'postgres', 'Starting embedded database', {
      port: this.config.postgresPort,
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
        `-p ${this.config.postgresPort} -h 127.0.0.1${socketOption}`,
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
        ['-D', this.paths.postgresData, '-m', 'fast', '-w', 'stop'],
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
        HTTP_PORT: String(this.config.internalApiPort),
        EXPOSE_443_PORT: 'false',
        WEBDAV_HTTP_PORT: String(this.config.appPort),
        WEBDAV_PROBE_BASE_URL: `http://127.0.0.1:${this.config.appPort}`,
        WORKER_API_KEY: '',
        UPLOAD_STORAGE_PATH: this.paths.uploads,
        THUMBNAIL_STORAGE_PATH: this.paths.thumbnails,
        RESTORE_STORAGE_PATH: this.paths.restore,
        BLENDER_INSTALL_PATH: this.paths.blender,
        ConnectionStrings__Default: `Host=127.0.0.1;Port=${this.config.postgresPort};Database=${POSTGRES_DATABASE};Username=${POSTGRES_USER};Password=${POSTGRES_PASSWORD};`,
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
      `http://127.0.0.1:${this.config.internalApiPort}/health`,
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
    return this.config.internalApiPort + 100 + index
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
        API_BASE_URL: `http://127.0.0.1:${this.config.internalApiPort}`,
        WORKER_API_KEY: '',
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
