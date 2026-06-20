// Shared helpers for the upgrade-integrity scripts (seed + verify). Zero external
// deps — only Node built-ins — so the scripts run on a bare CI runner against the
// installed app, exactly like src/desktop/scripts/integration/data-folder-migration.mjs.

import crypto from 'crypto'
import http from 'http'
import https from 'https'

// Default to the edge-proxied public API of an installed host. Override with
// MODELIBR_API_BASE (e.g. the self-signed docker stack at https://127.0.0.1:3010/api).
export const API_BASE = process.env.MODELIBR_API_BASE || 'http://127.0.0.1:3010/api'

export function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

export function request(method, url, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const transport = u.protocol === 'https:' ? https : http
    const req = transport.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers,
        // The local docker stack serves a self-signed cert on :3010; the installed
        // app is plain http. Accept self-signed so the same script covers both.
        rejectUnauthorized: false,
      },
      res => {
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            buffer: Buffer.concat(chunks),
            json() {
              return JSON.parse(Buffer.concat(chunks).toString())
            },
          })
        )
      }
    )
    req.on('error', reject)
    req.setTimeout(60000, () => req.destroy(new Error('request timed out')))
    if (body) req.write(body)
    req.end()
  })
}

// Build a multipart/form-data body. `fields` is an array of either
// { name, value } (text) or { name, filename, content } (file).
export function multipart(fields) {
  const boundary = '----modelibr-upgrade' + crypto.randomBytes(8).toString('hex')
  const parts = []
  for (const field of fields) {
    if (field.filename != null) {
      parts.push(
        Buffer.from(
          `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="${field.name}"; filename="${field.filename}"\r\n` +
            `Content-Type: application/octet-stream\r\n\r\n`
        ),
        field.content,
        Buffer.from('\r\n')
      )
    } else {
      parts.push(
        Buffer.from(
          `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="${field.name}"\r\n\r\n` +
            `${field.value}\r\n`
        )
      )
    }
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`))
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` }
}

// ───── Tiny inline fixtures (no committed binaries) ─────

const OBJ = Buffer.from('# modelibr upgrade cube\no cube\nv 0 0 0\nv 1 0 0\nv 1 1 0\nf 1 2 3\n')

// 1×1 opaque-red PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

// A valid 16-bit PCM mono WAV with a few samples (≈ a click of audio).
function makeWav() {
  const sampleRate = 8000
  const samples = 16
  const dataLen = samples * 2
  const buf = Buffer.alloc(44 + dataLen)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataLen, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16) // PCM chunk size
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28) // byte rate
  buf.writeUInt16LE(2, 32) // block align
  buf.writeUInt16LE(16, 34) // bits per sample
  buf.write('data', 36)
  buf.writeUInt32LE(dataLen, 40)
  for (let i = 0; i < samples; i++) buf.writeInt16LE((i % 2 ? 8000 : -8000), 44 + i * 2)
  return buf
}

const WAV = makeWav()

// The asset types a v0.1.0 host supports. Each is seeded once, then looked up by
// its unique name after the upgrade. `listKey` is the array property in the list
// response (null = the response IS the array, as for /models). `fileCheck` pulls
// the bytes back and compares the sha256 (only /models exposes /{id}/file).
export function assetTypes(tag) {
  return [
    {
      type: 'model',
      uploadPath: '/models',
      listPath: '/models',
      listKey: null,
      name: `upgrade-model-${tag}`,
      filename: `upgrade-model-${tag}.obj`,
      content: OBJ,
      fileUrlFor: id => `/models/${id}/file`,
    },
    {
      type: 'texture-set',
      uploadPath: '/texture-sets/with-file',
      listPath: '/texture-sets',
      listKey: 'textureSets',
      name: `upgrade-texset-${tag}`,
      filename: `upgrade-texset-${tag}.png`,
      content: PNG,
    },
    {
      type: 'sprite',
      uploadPath: '/sprites/with-file',
      listPath: '/sprites',
      listKey: 'sprites',
      name: `upgrade-sprite-${tag}`,
      filename: `upgrade-sprite-${tag}.png`,
      content: PNG,
    },
    {
      type: 'sound',
      uploadPath: '/sounds/with-file',
      listPath: '/sounds',
      listKey: 'sounds',
      name: `upgrade-sound-${tag}`,
      filename: `upgrade-sound-${tag}.wav`,
      content: WAV,
    },
    {
      type: 'environment-map',
      uploadPath: '/environment-maps/with-file',
      listPath: '/environment-maps',
      listKey: 'environmentMaps',
      name: `upgrade-envmap-${tag}`,
      filename: `upgrade-envmap-${tag}.png`,
      content: PNG,
    },
  ]
}

export function listArray(payload, listKey) {
  return listKey ? (payload?.[listKey] ?? []) : payload
}
