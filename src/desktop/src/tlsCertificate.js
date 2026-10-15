import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import selfsigned from 'selfsigned'

// The self-signed certificate the edge server presents to LAN clients when
// network access is on. Docker generates an equivalent one from nginx's
// entrypoint.sh via openssl, and the WebApi mints an in-memory one through .NET;
// neither is reachable from the Electron main process, and shelling out to
// openssl is not portable across macOS, Windows and Linux, so this uses the
// small pure-JavaScript `selfsigned` package instead.
//
// The certificate is written once next to the rest of the runtime data and
// reused on later starts. It is regenerated only when a current non-loopback
// IPv4 address is missing from the SAN list it was issued for (the machine got
// a new LAN address), because a browser rejects a certificate whose SANs do not
// cover the address it is opening.

export const TLS_CERT_FILE_NAME = 'modelibr-edge.crt'
export const TLS_KEY_FILE_NAME = 'modelibr-edge.key'
export const TLS_MANIFEST_FILE_NAME = 'modelibr-edge-cert.json'

// A year-plus validity so the certificate outlives many app starts; a fresh one
// is still issued whenever the machine's LAN address changes. 397 days matches
// the Docker nginx certificate.
const CERTIFICATE_VALIDITY_DAYS = 397

function isIPv4(entry) {
  // Node reports the family as 'IPv4' on current releases; older ones used the
  // number 4. Accept both, like findLanIPv4Address does.
  return entry && (entry.family === 'IPv4' || entry.family === 4)
}

// The names a certificate must be valid for: the loopback address, the machine
// hostname (and its mDNS `hostname.local` form), and every IPv4 interface
// address. Split into DNS and IP lists because a SAN entry encodes the kind.
export function collectCertificateNames({
  hostname = os.hostname(),
  interfaces = os.networkInterfaces(),
} = {}) {
  const dnsNames = new Set(['localhost'])
  if (hostname) {
    dnsNames.add(hostname)
    if (!hostname.endsWith('.local')) {
      dnsNames.add(`${hostname}.local`)
    }
  }

  // 127.0.0.1 is always present; the loopback interfaces report it too but the
  // explicit entry keeps the certificate valid even on an IPv6-only machine.
  const ipAddresses = new Set(['127.0.0.1'])
  for (const addresses of Object.values(interfaces)) {
    for (const entry of addresses ?? []) {
      if (isIPv4(entry)) {
        ipAddresses.add(entry.address)
      }
    }
  }

  return { dnsNames: [...dnsNames], ipAddresses: [...ipAddresses] }
}

// The non-loopback IPv4 addresses the OS reports now that the certificate does
// not cover. Empty means the stored certificate is still good.
export function missingInterfaceAddresses(
  storedAddresses = [],
  interfaces = os.networkInterfaces()
) {
  const stored = new Set(storedAddresses)
  const missing = []

  for (const addresses of Object.values(interfaces)) {
    for (const entry of addresses ?? []) {
      if (isIPv4(entry) && !entry.internal && !stored.has(entry.address)) {
        missing.push(entry.address)
      }
    }
  }

  return missing
}

async function readExistingCertificate(certPath, keyPath, manifestPath) {
  try {
    const [cert, key, manifestText] = await Promise.all([
      fs.readFile(certPath, 'utf8'),
      fs.readFile(keyPath, 'utf8'),
      fs.readFile(manifestPath, 'utf8'),
    ])
    const manifest = JSON.parse(manifestText)

    if (!cert || !key || !Array.isArray(manifest?.ipAddresses)) {
      return null
    }

    return { cert, key, manifest }
  } catch {
    // Missing or unreadable files, or a corrupt manifest, all mean "issue a new
    // one" - never a boot failure.
    return null
  }
}

export async function ensureTlsCertificate({
  dataDir,
  hostname = os.hostname(),
  interfaces = os.networkInterfaces(),
  log = () => {},
}) {
  const certPath = path.join(dataDir, TLS_CERT_FILE_NAME)
  const keyPath = path.join(dataDir, TLS_KEY_FILE_NAME)
  const manifestPath = path.join(dataDir, TLS_MANIFEST_FILE_NAME)

  const existing = await readExistingCertificate(certPath, keyPath, manifestPath)
  const missing = missingInterfaceAddresses(existing?.manifest.ipAddresses, interfaces)
  if (existing && missing.length === 0) {
    return { ...existing, certPath, keyPath, manifestPath }
  }

  const { dnsNames, ipAddresses } = collectCertificateNames({ hostname, interfaces })
  const notAfterDate = new Date(
    Date.now() + CERTIFICATE_VALIDITY_DAYS * 24 * 60 * 60 * 1000
  )

  const pems = await selfsigned.generate(
    [{ name: 'commonName', value: 'Modelibr' }],
    {
      algorithm: 'sha256',
      notAfterDate,
      extensions: [
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
        { name: 'extKeyUsage', serverAuth: true },
        {
          name: 'subjectAltName',
          altNames: [
            ...dnsNames.map(value => ({ type: 2, value })),
            ...ipAddresses.map(ip => ({ type: 7, ip })),
          ],
        },
      ],
    }
  )

  const manifest = {
    ipAddresses,
    dnsNames,
    createdAt: new Date().toISOString(),
  }

  await fs.mkdir(dataDir, { recursive: true })
  await Promise.all([
    fs.writeFile(certPath, pems.cert, 'utf8'),
    fs.writeFile(keyPath, pems.private, 'utf8'),
    fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
  ])

  if (missing.length > 0) {
    log(
      `[ModelibrDesktop][edge] Network address changed (${missing.join(', ')}) - issued a new self-signed certificate`
    )
  }

  return { cert: pems.cert, key: pems.private, manifest, certPath, keyPath, manifestPath }
}
