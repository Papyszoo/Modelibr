import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import {
  migrateDataDirectory,
  readMigrationMarker,
  writeMigrationMarker,
  clearMigrationMarker,
} from '../src/dataMigration.js'

function tmp() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'modelibr-mig-'))
}

async function writeFile(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, content)
}

test('migration marker round-trips and clears', async () => {
  const userData = await tmp()
  try {
    assert.equal(await readMigrationMarker(userData), null)
    await writeMigrationMarker(userData, '/old/root', '/new/root')
    assert.deepEqual(await readMigrationMarker(userData), { from: '/old/root', to: '/new/root' })
    await clearMigrationMarker(userData)
    assert.equal(await readMigrationMarker(userData), null)
  } finally {
    await fs.rm(userData, { recursive: true, force: true })
  }
})

test('migrate copies the whole data tree (uploads + database) into the new folder', async () => {
  const base = await tmp()
  try {
    const from = path.join(base, 'old')
    const to = path.join(base, 'new')
    await writeFile(path.join(from, 'uploads', 'model.glb'), 'GLB')
    await writeFile(path.join(from, 'postgres', 'PG_VERSION'), '16')

    const moved = await migrateDataDirectory(from, to)
    assert.equal(moved, true)
    assert.equal(await fs.readFile(path.join(to, 'uploads', 'model.glb'), 'utf8'), 'GLB')
    assert.equal(await fs.readFile(path.join(to, 'postgres', 'PG_VERSION'), 'utf8'), '16')
  } finally {
    await fs.rm(base, { recursive: true, force: true })
  }
})

test('migrate is a no-op when from and to are the same or from is missing', async () => {
  const base = await tmp()
  try {
    assert.equal(await migrateDataDirectory('/x', '/x'), false)
    assert.equal(await migrateDataDirectory(path.join(base, 'absent'), path.join(base, 'to')), false)
  } finally {
    await fs.rm(base, { recursive: true, force: true })
  }
})

test('migrate skips a target that is already an initialized data folder', async () => {
  const base = await tmp()
  try {
    const from = path.join(base, 'old')
    const to = path.join(base, 'new')
    await writeFile(path.join(from, 'uploads', 'a.glb'), 'FROM')
    // `to` already has its own cluster + asset — switching back must keep it.
    await writeFile(path.join(to, 'postgres', 'PG_VERSION'), '16')
    await writeFile(path.join(to, 'uploads', 'b.glb'), 'TO')

    const moved = await migrateDataDirectory(from, to)
    assert.equal(moved, false)
    // The target's own data is untouched, and the source wasn't merged in.
    assert.equal(await fs.readFile(path.join(to, 'uploads', 'b.glb'), 'utf8'), 'TO')
    await assert.rejects(fs.access(path.join(to, 'uploads', 'a.glb')))
  } finally {
    await fs.rm(base, { recursive: true, force: true })
  }
})

test('migrate never overwrites existing files in the target', async () => {
  const base = await tmp()
  try {
    const from = path.join(base, 'old')
    const to = path.join(base, 'new')
    await writeFile(path.join(from, 'uploads', 'shared.glb'), 'FROM')
    await writeFile(path.join(from, 'uploads', 'extra.glb'), 'EXTRA')
    // `to` exists but is NOT an initialized cluster (no PG_VERSION).
    await writeFile(path.join(to, 'uploads', 'shared.glb'), 'KEEP')

    const moved = await migrateDataDirectory(from, to)
    assert.equal(moved, true)
    assert.equal(await fs.readFile(path.join(to, 'uploads', 'shared.glb'), 'utf8'), 'KEEP')
    assert.equal(await fs.readFile(path.join(to, 'uploads', 'extra.glb'), 'utf8'), 'EXTRA')
  } finally {
    await fs.rm(base, { recursive: true, force: true })
  }
})
