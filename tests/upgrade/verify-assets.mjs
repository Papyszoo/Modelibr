// Upgrade-integrity test — STEP 2 (verify). Reads the manifest written by
// seed-assets.mjs (before the upgrade) and confirms, against the UPGRADED host,
// that every seeded asset is still there (by name), the model's bytes are
// byte-identical (sha256), and a brand-new 0.2.0-only asset type (Script) can be
// created — i.e. the upgrade preserved data AND the app still works.
//
// Usage: node tests/upgrade/verify-assets.mjs [manifestPath]
//   MODELIBR_API_BASE  API base (default http://127.0.0.1:3010/api)

import fs from 'fs/promises'

import { API_BASE, listArray, multipart, request, sha256 } from './lib.mjs'

const manifestPath = process.argv[2] || 'upgrade-manifest.json'

const failures = []
function check(ok, message) {
  if (ok) {
    console.log(`[verify] ✓ ${message}`)
  } else {
    console.error(`[verify] ✗ ${message}`)
    failures.push(message)
  }
}

async function findByName(record) {
  const res = await request('GET', `${API_BASE}${record.listPath}`)
  if (res.status !== 200) {
    return { ok: false, detail: `GET ${record.listPath} -> ${res.status}` }
  }
  const entry = listArray(res.json(), record.listKey).find(a => a?.name === record.name)
  return { ok: !!entry, entry }
}

async function verifyModelBytes(record, entry) {
  const id = entry.id ?? entry.Id
  const res = await request('GET', `${API_BASE}/models/${id}/file`)
  check(res.status === 200, `model #${id} file is downloadable`)
  check(sha256(res.buffer) === record.sha256, `model #${id} bytes are byte-identical after upgrade`)
}

async function verifyNewFeatureWorks() {
  // Scripts did not exist in v0.1.0 — creating one proves the schema migrated and
  // the upgraded app accepts writes for a type the old DB never had.
  const name = `upgrade-postcheck-script-${Date.now()}`
  const { body, contentType } = multipart([
    { name: 'file', filename: `${name}.cs`, content: Buffer.from('// post-upgrade smoke\n') },
    { name: 'name', value: name },
  ])
  const res = await request('POST', `${API_BASE}/scripts/with-file`, {
    headers: { 'content-type': contentType, 'content-length': body.length },
    body,
  })
  check(res.status >= 200 && res.status < 300, `can create a Script (0.2.0 feature) post-upgrade (${res.status})`)
  if (res.status < 200 || res.status >= 300) {
    return
  }

  // Read the new script back by the id the create returned — deterministic, so it
  // doesn't depend on /scripts list ordering or pagination.
  const created = res.json()
  const id = created.scriptId ?? created.id ?? created.Id
  const readBack = await request('GET', `${API_BASE}/scripts/${id}`)
  check(readBack.status === 200, `the new Script (#${id}) is readable from the upgraded app`)
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  console.log(`[verify] API ${API_BASE} — manifest tag ${manifest.tag} (${manifest.records.length} assets)`)

  for (const record of manifest.records) {
    const { ok, entry, detail } = await findByName(record)
    check(ok, `${record.type} "${record.name}" survived the upgrade${detail ? ` (${detail})` : ''}`)
    if (ok && record.hasFileUrl && record.type === 'model') {
      await verifyModelBytes(record, entry)
    }
  }

  await verifyNewFeatureWorks()

  if (failures.length) {
    console.error(`[verify] ❌ FAIL — ${failures.length} check(s) failed`)
    process.exit(1)
  }
  console.log('[verify] ✅ PASS — all assets survived the upgrade and the app works')
}

main().catch(error => {
  console.error('[verify] ❌ FAIL:', error.message || error)
  process.exit(1)
})
