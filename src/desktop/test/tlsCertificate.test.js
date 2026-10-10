import { test } from 'node:test'
import assert from 'node:assert/strict'
import { X509Certificate } from 'crypto'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import {
  collectCertificateNames,
  ensureTlsCertificate,
  missingInterfaceAddresses,
} from '../src/tlsCertificate.js'

// The edge server issues one self-signed certificate into the app data root and
// reuses it on later starts. A new LAN address must produce a new certificate,
// because a browser rejects a certificate whose SANs do not cover the address it
// is opening. `interfaces` is injectable so the change is deterministic here.

const HOSTNAME = 'studio-mac'

const INTERFACES_A = {
  lo0: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
  en0: [{ family: 'IPv4', address: '192.168.1.50', internal: false }],
}

const INTERFACES_B = {
  ...INTERFACES_A,
  en1: [{ family: 'IPv4', address: '10.0.0.7', internal: false }],
}

async function withDataDir(run) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'modelibr-cert-'))
  try {
    await run(dataDir)
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true })
  }
}

test('certificate names cover loopback, the hostname and every IPv4 address', () => {
  const { dnsNames, ipAddresses } = collectCertificateNames({
    hostname: HOSTNAME,
    interfaces: INTERFACES_A,
  })

  assert.deepEqual(dnsNames, ['localhost', HOSTNAME, `${HOSTNAME}.local`])
  assert.ok(ipAddresses.includes('127.0.0.1'))
  assert.ok(ipAddresses.includes('192.168.1.50'))
})

test('a hostname already ending in .local is not doubled', () => {
  const { dnsNames } = collectCertificateNames({
    hostname: 'living-room.local',
    interfaces: {},
  })

  assert.deepEqual(dnsNames, ['localhost', 'living-room.local'])
})

test('missingInterfaceAddresses reports only new non-loopback IPv4 addresses', () => {
  assert.deepEqual(missingInterfaceAddresses(['192.168.1.50'], INTERFACES_A), [])
  // Loopback and the already-stored address are not "missing".
  assert.deepEqual(missingInterfaceAddresses([], INTERFACES_A), ['192.168.1.50'])
  assert.deepEqual(missingInterfaceAddresses(['192.168.1.50'], INTERFACES_B), ['10.0.0.7'])
})

test('reuses the stored certificate when the machine addresses are unchanged', async () => {
  await withDataDir(async dataDir => {
    const first = await ensureTlsCertificate({
      dataDir,
      hostname: HOSTNAME,
      interfaces: INTERFACES_A,
      log: () => {},
    })
    const second = await ensureTlsCertificate({
      dataDir,
      hostname: HOSTNAME,
      interfaces: INTERFACES_A,
      log: () => {},
    })

    // The exact same certificate and manifest, not a freshly issued one.
    assert.equal(second.cert, first.cert)
    assert.equal(second.manifest.createdAt, first.manifest.createdAt)
  })
})

test('regenerates the certificate when a new IPv4 address appears', async () => {
  await withDataDir(async dataDir => {
    const first = await ensureTlsCertificate({
      dataDir,
      hostname: HOSTNAME,
      interfaces: INTERFACES_A,
      log: () => {},
    })

    const regenerated = await ensureTlsCertificate({
      dataDir,
      hostname: HOSTNAME,
      interfaces: INTERFACES_B,
      log: () => {},
    })

    assert.notEqual(regenerated.cert, first.cert)
    assert.ok(regenerated.manifest.ipAddresses.includes('10.0.0.7'))

    const cert = new X509Certificate(regenerated.cert)
    assert.match(cert.subjectAltName, /IP Address:10\.0\.0\.7/)
    assert.match(cert.subjectAltName, /IP Address:192\.168\.1\.50/)
    assert.match(cert.subjectAltName, new RegExp(`DNS:${HOSTNAME.replace('.', '\\.')}`))
  })
})

test('reissues when the stored certificate file is gone', async () => {
  await withDataDir(async dataDir => {
    const first = await ensureTlsCertificate({
      dataDir,
      hostname: HOSTNAME,
      interfaces: INTERFACES_A,
      log: () => {},
    })
    await fs.rm(first.certPath)

    const reissued = await ensureTlsCertificate({
      dataDir,
      hostname: HOSTNAME,
      interfaces: INTERFACES_A,
      log: () => {},
    })

    assert.notEqual(reissued.cert, first.cert)
    const cert = new X509Certificate(reissued.cert)
    assert.match(cert.subjectAltName, /IP Address:192\.168\.1\.50/)
  })
})
