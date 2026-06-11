import { test } from 'node:test'
import assert from 'node:assert/strict'
import net from 'net'

import { isPortFree, getEphemeralPort, resolveUsablePort } from '../src/ports.js'

function listen(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

test('getEphemeralPort returns a bindable port', async () => {
  const port = await getEphemeralPort()
  assert.ok(port > 0 && port <= 65535)
  assert.equal(await isPortFree(port), true)
})

test('isPortFree reflects whether a port is in use', async () => {
  const port = await getEphemeralPort()
  assert.equal(await isPortFree(port), true)
  const server = await listen(port)
  try {
    assert.equal(await isPortFree(port), false)
  } finally {
    await new Promise(r => server.close(r))
  }
})

test('resolveUsablePort keeps a free port', async () => {
  const port = await getEphemeralPort()
  assert.equal(await resolveUsablePort(port), port)
})

test('resolveUsablePort falls back to a free port when the preferred one is taken', async () => {
  const port = await getEphemeralPort()
  const server = await listen(port)
  try {
    const resolved = await resolveUsablePort(port)
    assert.notEqual(resolved, port)
    assert.equal(await isPortFree(resolved), true)
  } finally {
    await new Promise(r => server.close(r))
  }
})
