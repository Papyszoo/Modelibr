import { unzipSync } from 'fflate'

/**
 * Expand a `.zip` into `File` objects that carry their archive-relative path, so an
 * archive import is indistinguishable from a picked folder from that point on.
 *
 * Extracting client-side (rather than posting the archive to a server-side unzip
 * endpoint) is what keeps zip import on the SAME path as every other upload: the same
 * grouping, the same `.blend`/renderability gates, the same per-model progress entries,
 * the same result shape, and the same pack/project association. A separate server route
 * meant a separate response shape, which is exactly how zip imports silently stopped
 * associating anything and stopped refreshing the grid.
 *
 * Runs entirely in the browser - no network, no hosted service.
 */
export async function extractZipEntries(zip: File): Promise<File[]> {
  const buffer = new Uint8Array(await zip.arrayBuffer())

  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(buffer)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not read ${zip.name} as a .zip archive: ${message}`)
  }

  const files: File[] = []
  for (const [path, bytes] of Object.entries(entries)) {
    // Directory markers carry no bytes; archive tools also add metadata entries
    // (macOS `__MACOSX/`, `.DS_Store`, Windows `Thumbs.db`) that are not assets.
    if (path.endsWith('/') || bytes.length === 0) continue
    if (isArchiveMetadata(path)) continue

    const normalized = path.replace(/\\/g, '/').replace(/^\.?\/+/, '')
    const name = normalized.slice(normalized.lastIndexOf('/') + 1)
    if (name.length === 0) continue

    files.push(fileWithRelativePath(new File([bytes], name), normalized))
  }

  return files
}

function isArchiveMetadata(path: string): boolean {
  const normalized = path.replace(/\\/g, '/')
  if (normalized.startsWith('__MACOSX/') || normalized.includes('/__MACOSX/')) {
    return true
  }
  const name = normalized.slice(normalized.lastIndexOf('/') + 1)
  return name === '.DS_Store' || name === 'Thumbs.db' || name.startsWith('._')
}

/**
 * Attach an archive-relative path to a File the way a folder picker does.
 * `webkitRelativePath` is read-only on File, so it has to be defined rather than
 * assigned - this is the one place that does it, and `groupFilesForImport` reads it
 * without caring whether the files came from a picker or an archive.
 */
function fileWithRelativePath(file: File, relativePath: string): File {
  Object.defineProperty(file, 'webkitRelativePath', {
    value: relativePath,
    writable: false,
    enumerable: true,
    configurable: true,
  })
  return file
}
