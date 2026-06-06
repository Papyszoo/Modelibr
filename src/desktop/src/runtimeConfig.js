import fs from 'fs/promises'
import path from 'path'

export const DEFAULT_RUNTIME_CONFIG = Object.freeze({
  appPort: 3010,
  internalApiPort: 38080,
  postgresPort: 35432,
  // Default to a single worker process. Running multiple worker *processes* can
  // double-claim the same job (the server-side dequeue isn't fully atomic across
  // processes): two workers pick up one job, one wins and the other fails the
  // upload and marks the job failed. Per-worker concurrency
  // (maxConcurrentJobsPerWorker) parallelises safely within one process. The
  // setting remains user-tunable for advanced setups.
  workerProcessCount: 1,
  maxConcurrentJobsPerWorker: 3,
  // Default to software rendering (swiftshader): it produces thumbnails on any
  // machine, including GPU-less laptops, VMs, and headless runners. GPU
  // acceleration is faster but fails to initialize WebGL on machines without a
  // usable GPU, so it's opt-in via the Configuration panel.
  enableHardwareAcceleration: false,
  // Where uploads, thumbnails, the embedded database, etc. live. Empty string
  // means "use the default under the app's userData dir"; the ProcessManager
  // resolves it. Set a custom absolute path to relocate all data (e.g. to a
  // larger drive). Changing it requires a restart.
  dataDirectory: '',
})

function sanitizeDataDirectory(input) {
  const value = String(input ?? '').trim()
  // Only honor absolute paths; anything else (relative, empty) falls back to
  // the default location chosen by the ProcessManager.
  return value && path.isAbsolute(value) ? value : ''
}

function coerceInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (Number.isNaN(parsed)) {
    return fallback
  }

  return Math.min(Math.max(parsed, minimum), maximum)
}

export function sanitizeRuntimeConfig(input = {}) {
  return {
    appPort: coerceInteger(input.appPort, DEFAULT_RUNTIME_CONFIG.appPort, 1024, 65535),
    internalApiPort: coerceInteger(
      input.internalApiPort,
      DEFAULT_RUNTIME_CONFIG.internalApiPort,
      1024,
      65535
    ),
    postgresPort: coerceInteger(
      input.postgresPort,
      DEFAULT_RUNTIME_CONFIG.postgresPort,
      1024,
      65535
    ),
    workerProcessCount: coerceInteger(
      input.workerProcessCount,
      DEFAULT_RUNTIME_CONFIG.workerProcessCount,
      1,
      16
    ),
    maxConcurrentJobsPerWorker: coerceInteger(
      input.maxConcurrentJobsPerWorker,
      DEFAULT_RUNTIME_CONFIG.maxConcurrentJobsPerWorker,
      1,
      16
    ),
    // Opt-in: only enabled when explicitly set true; absent/false → software
    // rendering, which works on any machine.
    enableHardwareAcceleration:
      input.enableHardwareAcceleration === true ||
      input.enableHardwareAcceleration === 'true',
    dataDirectory: sanitizeDataDirectory(input.dataDirectory),
  }
}

export async function loadRuntimeConfig(userDataDir) {
  const configPath = path.join(userDataDir, 'native-runtime.json')
  let parsed = {}

  try {
    parsed = JSON.parse(await fs.readFile(configPath, 'utf8'))
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error
    }
  }

  const config = sanitizeRuntimeConfig(parsed)

  await fs.mkdir(userDataDir, { recursive: true })
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')

  return { config, configPath }
}

export async function saveRuntimeConfig(configPath, input) {
  const config = sanitizeRuntimeConfig(input)
  await fs.mkdir(path.dirname(configPath), { recursive: true })
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  return config
}
