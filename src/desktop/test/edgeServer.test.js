import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import http from 'http'
import net from 'net'
import os from 'os'
import path from 'path'

import { startEdgeServer } from '../src/edgeServer.js'
import { ProcessManager } from '../src/processManager.js'
import { loadRuntimeConfig } from '../src/runtimeConfig.js'

// Unlike the other suites (which exercise the config logic in isolation), this
// one stands up the REAL edge server on a REAL port and drives it over HTTP, so
// it verifies the actual "saving a port change doesn't move the live server"
// behaviour rather than just the bookkeeping behind it.

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

function request(method, url, payload) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const body = payload ? Buffer.from(JSON.stringify(payload)) : null
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method,
        headers: body
          ? { 'content-type': 'application/json', 'content-length': body.length }
          : {},
      },
      res => {
        let data = ''
        res.on('data', chunk => (data += chunk))
        res.on('end', () => resolve({ status: res.statusCode, body: data }))
      }
    )
    req.on('error', reject)
    req.setTimeout(3000, () => req.destroy(new Error('request timed out')))
    if (body) req.write(body)
    req.end()
  })
}

test('saving a new app port keeps the live server on the bound port', async () => {
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'modelibr-edge-'))
  const runtimeDir = path.join(userData, 'runtime')
  await fs.mkdir(path.join(runtimeDir, 'frontend'), { recursive: true })
  await fs.writeFile(
    path.join(runtimeDir, 'frontend', 'index.html'),
    '<!doctype html><title>modelibr-ok</title>'
  )

  const appPort = await freePort()
  const savedPort = await freePort() // a free port we'll save but expect nothing to bind
  const internalApiPort = await freePort() // never proxied to in this test

  const { config, configPath } = await loadRuntimeConfig(userData)
  const runtimeManager = new ProcessManager({
    runtimeDir,
    userDataDir: userData,
    config: { ...config, appPort, internalApiPort },
    log: () => {},
  })
  runtimeManager.markRunning() // services "booted" on appPort

  const edge = await startEdgeServer({ runtimeDir, configPath, runtimeManager, log: () => {} })
  try {
    // The snapshot endpoint reports the bound port.
    const before = await request('GET', `http://127.0.0.1:${appPort}/api/native/runtime`)
    assert.equal(before.status, 200)
    assert.match(before.body, new RegExp(`127\\.0\\.0\\.1:${appPort}`))

    // Save a new app port through the in-browser endpoint.
    const put = await request('PUT', `http://127.0.0.1:${appPort}/api/native/runtime`, {
      appPort: savedPort,
    })
    assert.equal(put.status, 200)
    const payload = JSON.parse(put.body)
    assert.equal(payload.restartRequired, true)
    // The reported URL is still the ACTIVE (bound) one, not the saved one.
    assert.equal(payload.config.publicAppUrl, `http://127.0.0.1:${appPort}`)
    assert.equal(payload.config.pendingRestart, true)

    // The live server still serves the frontend on the original port...
    const stillServing = await request('GET', `http://127.0.0.1:${appPort}/`)
    assert.equal(stillServing.status, 200)
    assert.match(stillServing.body, /modelibr-ok/)

    // ...and nothing is listening on the just-saved port yet (no silent rebind).
    await assert.rejects(request('GET', `http://127.0.0.1:${savedPort}/`))
  } finally {
    await edge.close()
    await fs.rm(userData, { recursive: true, force: true })
  }
})
