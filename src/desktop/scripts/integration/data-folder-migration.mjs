// Host-level integration test (no Electron). Boots the real bundled WebApi +
// embedded PostgreSQL from a built runtime, uploads a model, moves the data
// folder with the same migration the app uses, boots again on the new folder,
// and verifies the model is still listed AND its bytes are intact — i.e. that
// changing the data folder doesn't lose data.
//
// Needs a built runtime (run `npm run dist`, or set MODELIBR_RUNTIME_DIR). It
// skips cleanly when none is present, so it's safe to run anywhere.

import fs from 'fs/promises'
import http from 'http'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

import { ProcessManager } from '../../src/processManager.js'
import { migrateDataDirectory } from '../../src/dataMigration.js'
import { getEphemeralPort } from '../../src/ports.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(__dirname, '..', '..')

const OBJ = Buffer.from('# modelibr integration cube\no cube\nv 0 0 0\nv 1 0 0\nv 1 1 0\nf 1 2 3\n')

function log(message) {
  console.log(`[integration] ${message}`)
}

function platformExe(name) {
  return process.platform === 'win32' ? `${name}.exe` : name
}

async function exists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`assertion failed: ${message}`)
  }
}

async function resolveRuntimeDir() {
  const dir = process.env.MODELIBR_RUNTIME_DIR || path.join(desktopRoot, 'build', 'runtime')
  const webapi = path.join(dir, 'webapi', platformExe('WebApi'))
  const pgCtl = path.join(dir, 'postgres', 'bin', platformExe('pg_ctl'))
  if (!(await exists(webapi)) || !(await exists(pgCtl))) {
    return null
  }
  return dir
}

async function distinctFreePorts(count) {
  const ports = []
  while (ports.length < count) {
    const port = await getEphemeralPort()
    if (!ports.includes(port)) {
      ports.push(port)
    }
  }
  return ports
}

// Boots Postgres + WebApi only (no workers, no edge server) on the given data
// folder, returning the running ProcessManager.
async function bootHost(runtimeDir, userDataDir, dataDirectory) {
  const [appPort, internalApiPort, postgresPort] = await distinctFreePorts(3)
  const pm = new ProcessManager({
    runtimeDir,
    userDataDir,
    config: {
      appPort,
      internalApiPort,
      postgresPort,
      workerProcessCount: 1,
      maxConcurrentJobsPerWorker: 1,
      enableHardwareAcceleration: false,
      dataDirectory,
    },
    log: () => {},
  })
  await pm.ensureLayout()
  await pm.ensurePostgresCluster()
  await pm.startPostgres()
  await pm.startWebApi()
  return pm
}

async function stopHost(pm) {
  try {
    await pm.stopWebApi()
  } catch {
    /* best effort */
  }
  try {
    await pm.stopPostgres()
  } catch {
    /* best effort */
  }
}

function apiBase(pm) {
  return `http://127.0.0.1:${pm.config.internalApiPort}`
}

function request(method, url, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers },
      res => {
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks) }))
      }
    )
    req.on('error', reject)
    req.setTimeout(30000, () => req.destroy(new Error('request timed out')))
    if (body) req.write(body)
    req.end()
  })
}

function multipart(fieldName, filename, content) {
  const boundary = '----modelibr' + Math.random().toString(16).slice(2)
  const head =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`
  const tail = `\r\n--${boundary}--\r\n`
  const body = Buffer.concat([Buffer.from(head), content, Buffer.from(tail)])
  return { body, contentType: `multipart/form-data; boundary=${boundary}` }
}

async function uploadModel(pm, filename, content) {
  const { body, contentType } = multipart('file', filename, content)
  const res = await request('POST', `${apiBase(pm)}/models`, {
    headers: {
      'content-type': contentType,
      'content-length': body.length,
      'x-api-key': pm.workerApiKey,
    },
    body,
  })
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`upload failed: ${res.status} ${res.buffer.toString().slice(0, 200)}`)
  }
}

async function listModels(pm) {
  const res = await request('GET', `${apiBase(pm)}/models`, {
    headers: { 'x-api-key': pm.workerApiKey },
  })
  assert(res.status === 200, `GET /models returned ${res.status}`)
  return JSON.parse(res.buffer.toString())
}

async function getModelFile(pm, id) {
  return request('GET', `${apiBase(pm)}/models/${id}/file`, {
    headers: { 'x-api-key': pm.workerApiKey },
  })
}

async function main() {
  const runtimeDir = await resolveRuntimeDir()
  if (!runtimeDir) {
    log('No built runtime found (set MODELIBR_RUNTIME_DIR or run `npm run dist`). Skipping.')
    return
  }
  log(`Using runtime: ${runtimeDir}`)

  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'modelibr-integration-'))
  const userDataDir = path.join(base, 'userdata')
  const folderA = path.join(base, 'data-a')
  const folderB = path.join(base, 'data-b')
  await fs.mkdir(userDataDir, { recursive: true })

  let pm = null
  try {
    log('Booting host on folder A…')
    pm = await bootHost(runtimeDir, userDataDir, folderA)
    log('Host up on A — uploading a model…')
    await uploadModel(pm, 'integration-cube.obj', OBJ)

    let models = await listModels(pm)
    assert(Array.isArray(models) && models.length === 1, `expected 1 model on A, got ${models.length}`)
    const idA = models[0].id ?? models[0].Id
    assert(idA, 'model id missing in list response')
    const fileA = await getModelFile(pm, idA)
    assert(fileA.status === 200, `GET file on A returned ${fileA.status}`)
    assert(fileA.buffer.equals(OBJ), 'file bytes differ on A')
    log(`Model #${idA} uploaded and readable on A.`)

    await stopHost(pm)
    pm = null

    log('Migrating data folder A → B…')
    assert(await migrateDataDirectory(folderA, folderB), 'migration reported no move')

    log('Booting host on folder B…')
    pm = await bootHost(runtimeDir, userDataDir, folderB)
    models = await listModels(pm)
    assert(models.length === 1, `model did not survive the move (got ${models.length} on B)`)
    const idB = models[0].id ?? models[0].Id
    const fileB = await getModelFile(pm, idB)
    assert(fileB.status === 200, `GET file on B returned ${fileB.status}`)
    assert(fileB.buffer.equals(OBJ), 'file bytes differ on B — uploads were not migrated')

    await stopHost(pm)
    pm = null

    // Simulate an unclean exit (crash / force-quit) that left a postmaster.pid
    // behind, then boot again — the host must recover instead of failing with
    // "lock file already exists".
    log('Writing a stale postmaster.pid and rebooting to test recovery…')
    const pgData = path.join(folderB, 'postgres')
    await fs.writeFile(path.join(pgData, 'postmaster.pid'), `2147483646\n${pgData}\n`)
    pm = await bootHost(runtimeDir, userDataDir, folderB)
    const recovered = await listModels(pm)
    assert(recovered.length === 1, `host did not recover from a stale lock (got ${recovered.length})`)
    await stopHost(pm)
    pm = null
    log('Recovered from a stale postmaster.pid with data intact.')

    log('✅ PASS — model survived the data-folder change AND a stale-lock recovery.')
  } finally {
    if (pm) await stopHost(pm)
    await fs.rm(base, { recursive: true, force: true }).catch(() => {})
  }
}

main().catch(error => {
  console.error('[integration] ❌ FAIL:', error)
  process.exit(1)
})
