import { test } from 'node:test'
import assert from 'node:assert/strict'
import { X509Certificate } from 'crypto'
import fs from 'fs/promises'
import http from 'http'
import https from 'https'
import net from 'net'
import os from 'os'
import path from 'path'

import { startEdgeServer, requireLocalClient } from '../src/edgeServer.js'
import { ProcessManager, findLanIPv4Address } from '../src/processManager.js'
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
    const transport = u.protocol === 'https:' ? https : http
    const body = payload ? Buffer.from(JSON.stringify(payload)) : null
    const req = transport.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method,
        // The edge server presents a self-signed certificate; a test client must
        // accept it, exactly like a browser after the one-time warning.
        rejectUnauthorized: false,
        agent: false,
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

// Regression: with "Allow access from my network" on the edge server binds
// 0.0.0.0, so any LAN device could rewrite ports and the data folder through
// PUT /api/native/runtime. That endpoint must answer 403 to a non-local client.
function fakeResponse() {
  const captured = { status: null, body: null }
  return {
    captured,
    status(code) {
      captured.status = code
      return this
    },
    json(payload) {
      captured.body = payload
      return this
    },
  }
}

test('native runtime PUT answers 403 to a non-loopback client', () => {
  const response = fakeResponse()
  let nextCalled = false

  requireLocalClient(
    { socket: { remoteAddress: '192.168.1.20' } },
    response,
    () => {
      nextCalled = true
    }
  )

  assert.equal(response.captured.status, 403)
  assert.equal(response.captured.body.error, 'forbidden')
  assert.equal(nextCalled, false)
})

test('native runtime PUT lets loopback clients through', () => {
  for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
    const response = fakeResponse()
    let nextCalled = false

    requireLocalClient({ socket: { remoteAddress: address } }, response, () => {
      nextCalled = true
    })

    assert.equal(nextCalled, true, `expected ${address} to count as local`)
    assert.equal(response.captured.status, null)
  }
})

test('a real LAN client is refused over HTTP', { skip: !findLanIPv4Address() }, async () => {
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'modelibr-lan-'))
  const runtimeDir = path.join(userData, 'runtime')
  await fs.mkdir(path.join(runtimeDir, 'frontend'), { recursive: true })
  await fs.writeFile(
    path.join(runtimeDir, 'frontend', 'index.html'),
    '<!doctype html><title>modelibr-ok</title>'
  )

  const appPort = await freePort()
  const internalApiPort = await freePort()
  const lanHost = findLanIPv4Address()

  const { config, configPath } = await loadRuntimeConfig(userData)
  const runtimeManager = new ProcessManager({
    runtimeDir,
    userDataDir: userData,
    config: { ...config, appPort, internalApiPort, allowNetworkAccess: true },
    log: () => {},
  })
  runtimeManager.markRunning() // bound on 0.0.0.0 because network access is on

  const edge = await startEdgeServer({ runtimeDir, configPath, runtimeManager, log: () => {} })
  try {
    const refusal = await request(
      'PUT',
      `http://${lanHost}:${appPort}/api/native/runtime`,
      { appPort: 4010 }
    )
    assert.equal(refusal.status, 403)

    // The same call from this machine still works.
    const allowed = await request('PUT', `http://127.0.0.1:${appPort}/api/native/runtime`, {
      appPort: 4010,
    })
    assert.equal(allowed.status, 200)
  } finally {
    await edge.close()
    await fs.rm(userData, { recursive: true, force: true })
  }
})

// With network access on, the same port must answer both a TLS handshake (a LAN
// browser forcing HTTPS, which used to die with SSL_ERROR_RX_RECORD_TOO_LONG)
// and plain HTTP (the Electron window and MCP clients on loopback).
test('network access serves TLS and plain HTTP on the same port', async () => {
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'modelibr-tls-'))
  const runtimeDir = path.join(userData, 'runtime')
  await fs.mkdir(path.join(runtimeDir, 'frontend'), { recursive: true })
  await fs.writeFile(
    path.join(runtimeDir, 'frontend', 'index.html'),
    '<!doctype html><title>modelibr-ok</title>'
  )

  const appPort = await freePort()
  const internalApiPort = await freePort()

  const { config, configPath } = await loadRuntimeConfig(userData)
  const runtimeManager = new ProcessManager({
    runtimeDir,
    userDataDir: userData,
    config: { ...config, appPort, internalApiPort, allowNetworkAccess: true },
    log: () => {},
  })
  runtimeManager.markRunning()

  const edge = await startEdgeServer({ runtimeDir, configPath, runtimeManager, log: () => {} })
  try {
    const plain = await request('GET', `http://127.0.0.1:${appPort}/`)
    assert.equal(plain.status, 200)
    assert.match(plain.body, /modelibr-ok/)

    const tls = await request('GET', `https://127.0.0.1:${appPort}/`)
    assert.equal(tls.status, 200)
    assert.match(tls.body, /modelibr-ok/)

    // The certificate the edge server presents is written into the data root and
    // covers the loopback address, so a browser reaching it over HTTPS accepts
    // the host (after the one-time warning).
    const cert = new X509Certificate(
      await fs.readFile(path.join(runtimeManager.paths.data, 'modelibr-edge.crt'), 'utf8')
    )
    assert.match(cert.subjectAltName, /IP Address:127\.0\.0\.1/)
    assert.match(cert.subjectAltName, /DNS:localhost/)
  } finally {
    await edge.close()
    await fs.rm(userData, { recursive: true, force: true })
  }
})
