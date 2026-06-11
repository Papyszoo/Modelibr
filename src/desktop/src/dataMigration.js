import fs from 'fs/promises'
import path from 'path'

const MARKER = 'pending-data-migration.json'
const LEFTOVER = 'previous-data-folder.json'

export function migrationMarkerPath(userDataDir) {
  return path.join(userDataDir, MARKER)
}

function leftoverPath(userDataDir) {
  return path.join(userDataDir, LEFTOVER)
}

// After a successful migration the old folder is left in place as a backup. We
// record it so the UI can offer to open it and reassure the user it's safe to
// delete — we never delete a data folder ourselves (too easy to lose the DB).
export async function writeLeftoverFolder(userDataDir, folder) {
  await fs.mkdir(userDataDir, { recursive: true })
  await fs.writeFile(leftoverPath(userDataDir), JSON.stringify({ path: folder }), 'utf8')
}

export async function readLeftoverFolder(userDataDir) {
  try {
    return JSON.parse(await fs.readFile(leftoverPath(userDataDir), 'utf8'))
  } catch {
    return null
  }
}

export async function clearLeftoverFolder(userDataDir) {
  await fs.rm(leftoverPath(userDataDir), { force: true })
}

async function pathExists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

// Records that the data folder changed, so the *next* startup can move the
// existing assets/database into the new location before any service touches it.
// Writing it from the running instance (which knows the old, active root) is how
// the relaunched instance learns where to migrate from. Cleared when the desired
// root matches the active one again (the change was undone).
export async function writeMigrationMarker(userDataDir, from, to) {
  await fs.mkdir(userDataDir, { recursive: true })
  await fs.writeFile(
    migrationMarkerPath(userDataDir),
    JSON.stringify({ from, to }),
    'utf8'
  )
}

export async function readMigrationMarker(userDataDir) {
  try {
    return JSON.parse(await fs.readFile(migrationMarkerPath(userDataDir), 'utf8'))
  } catch {
    return null
  }
}

export async function clearMigrationMarker(userDataDir) {
  await fs.rm(migrationMarkerPath(userDataDir), { force: true })
}

// Copies the data tree from `from` into `to` so a data-folder change keeps all
// existing uploads, thumbnails and the embedded database. Safe to run only at
// startup (Postgres is stopped). No-op when:
//   - from and to are the same, or `from` doesn't exist; or
//   - `to` already holds an initialized cluster — so switching *back* to a
//     folder you used before keeps that folder's own data instead of clobbering
//     it. Existing files in `to` are never overwritten.
// Returns true when it actually copied something.
export async function migrateDataDirectory(from, to) {
  if (!from || !to || from === to) {
    return false
  }
  if (!(await pathExists(from))) {
    return false
  }
  if (await pathExists(path.join(to, 'postgres', 'PG_VERSION'))) {
    return false
  }

  await fs.mkdir(to, { recursive: true })
  await fs.cp(from, to, { recursive: true, force: false, errorOnExist: false })
  return true
}
