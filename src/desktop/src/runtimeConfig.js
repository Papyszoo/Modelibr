import fs from 'fs/promises'
import path from 'path'

export const DEFAULT_RUNTIME_CONFIG = Object.freeze({
  appPort: 3010,
  internalApiPort: 38080,
  postgresPort: 35432,
  workerProcessCount: 1,
  maxConcurrentJobsPerWorker: 3,
  enableHardwareAcceleration: true,
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
    enableHardwareAcceleration:
      input.enableHardwareAcceleration !== false &&
      input.enableHardwareAcceleration !== 'false',
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
