import fs from 'fs/promises'
import path from 'path'

// The client ships no runtime of its own — it points at a Modelibr host. The
// default targets a host running locally on its standard public port.
export const DEFAULT_HOST_URL = 'http://127.0.0.1:3010'

function sanitizeHostUrl(input) {
  const value = String(input ?? '').trim()
  if (!value) {
    return DEFAULT_HOST_URL
  }

  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return DEFAULT_HOST_URL
    }
    // Drop trailing slash so we can append paths predictably.
    return url.toString().replace(/\/$/, '')
  } catch {
    return DEFAULT_HOST_URL
  }
}

function configFilePath(userDataDir) {
  return path.join(userDataDir, 'client-config.json')
}

export async function loadClientConfig(userDataDir) {
  const configPath = configFilePath(userDataDir)
  let parsed = {}

  try {
    parsed = JSON.parse(await fs.readFile(configPath, 'utf8'))
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error
    }
  }

  const config = { hostUrl: sanitizeHostUrl(parsed.hostUrl) }

  await fs.mkdir(userDataDir, { recursive: true })
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')

  return { config, configPath }
}

export async function saveClientConfig(configPath, input) {
  const config = { hostUrl: sanitizeHostUrl(input.hostUrl) }
  await fs.mkdir(path.dirname(configPath), { recursive: true })
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  return config
}
