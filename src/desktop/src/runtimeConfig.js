import fs from 'fs/promises'
import os from 'os'
import path from 'path'

// Software (swiftshader) rendering is CPU-bound, and a single texture-set
// thumbnail can occupy a worker for minutes. With only one worker, a slow
// render head-of-line-blocks every other asset (e.g. a quick model thumbnail
// waits behind it). Default to a small, CPU-aware pool so capable machines
// render thumbnails in parallel, while low-core machines stay at one worker to
// bound memory (each worker runs its own headless Chromium).
function defaultWorkerProcessCount() {
  const cores = os.cpus()?.length || 1
  return Math.max(1, Math.min(Math.floor(cores / 2), 2))
}

export const DEFAULT_RUNTIME_CONFIG = Object.freeze({
  appPort: 3010,
  internalApiPort: 38080,
  postgresPort: 35432,
  workerProcessCount: defaultWorkerProcessCount(),
  maxConcurrentJobsPerWorker: 3,
  // Default to software rendering (swiftshader): it produces thumbnails on any
  // machine, including GPU-less laptops, VMs, and headless runners. GPU
  // acceleration is faster but fails to initialize WebGL on machines without a
  // usable GPU, so it's opt-in via the Configuration panel.
  enableHardwareAcceleration: false,
})

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
