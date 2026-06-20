// Upgrade-integrity test — STEP 1 (seed). Uploads one of every asset type the
// previous (old) Modelibr version supports through the host's public API, then
// writes a manifest (name + uploaded-bytes sha256 per asset) for verify-assets.mjs
// to check after the app has been upgraded in place.
//
// Usage: node tests/upgrade/seed-assets.mjs [manifestPath]
//   MODELIBR_API_BASE  API base (default http://127.0.0.1:3010/api)

import fs from 'fs/promises'

import { API_BASE, assetTypes, multipart, request, sha256 } from './lib.mjs'

const manifestPath = process.argv[2] || 'upgrade-manifest.json'

async function seedOne(spec) {
  const fields = [
    { name: 'file', filename: spec.filename, content: spec.content },
    { name: 'name', value: spec.name },
  ]
  const { body, contentType } = multipart(fields)
  const res = await request('POST', `${API_BASE}${spec.uploadPath}`, {
    headers: { 'content-type': contentType, 'content-length': body.length },
    body,
  })
  if (res.status < 200 || res.status >= 300) {
    throw new Error(
      `seed ${spec.type} failed: POST ${spec.uploadPath} -> ${res.status} ${res.buffer
        .toString()
        .slice(0, 300)}`
    )
  }
  console.log(`[seed] ${spec.type.padEnd(16)} "${spec.name}" (${res.status})`)
  return {
    type: spec.type,
    name: spec.name,
    listPath: spec.listPath,
    listKey: spec.listKey,
    sha256: sha256(spec.content),
    hasFileUrl: typeof spec.fileUrlFor === 'function',
  }
}

async function main() {
  const tag = process.env.MODELIBR_SEED_TAG || `${Date.now()}`
  console.log(`[seed] API ${API_BASE} — tag ${tag}`)

  const records = []
  for (const spec of assetTypes(tag)) {
    records.push(await seedOne(spec))
  }

  const manifest = { tag, apiBase: API_BASE, seededAt: new Date().toISOString(), records }
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  console.log(`[seed] ✅ seeded ${records.length} assets — manifest written to ${manifestPath}`)
}

main().catch(error => {
  console.error('[seed] ❌ FAIL:', error.message || error)
  process.exit(1)
})
