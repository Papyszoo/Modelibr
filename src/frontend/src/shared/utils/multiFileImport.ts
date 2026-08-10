import { isSupportedModelFormat, isThreeJSRenderable } from '@/utils/fileUtils'

/**
 * One importable model group: a primary model file plus the auxiliary (external)
 * files that live under its directory — the `.bin` buffers and textures a loose
 * `.gltf` references. Mirrors the backend grouping so a folder upload posts the
 * same shape a `.zip` upload produces server-side.
 */
export interface ModelImportGroup {
  primary: File
  auxiliaries: { file: File; relativePath: string }[]
}

/** The archive-relative path of a picked file (folder pickers set webkitRelativePath). */
function pathOf(file: File): string {
  const raw = (file as File & { webkitRelativePath?: string })
    .webkitRelativePath
  const path = raw && raw.length > 0 ? raw : file.name
  return path.replace(/\\/g, '/').replace(/^\.?\/+/, '')
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot).toLowerCase()
}

function directoryOf(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash < 0 ? '' : path.slice(0, slash)
}

function isUnder(path: string, dir: string): boolean {
  return dir.length === 0 || path.startsWith(dir + '/')
}

function relativeTo(path: string, dir: string): string {
  return dir.length === 0 ? path : path.slice(dir.length + 1)
}

/** Which formats may act as a group's primary model file. */
export interface ImportGroupingOptions {
  /**
   * Restrict primaries to formats the in-app viewer can load. Mirrors the single-file
   * upload path's `requireThreeJSRenderable` gate — without it a folder import was a
   * side door for `.dae`/`.3ds`, which the grid's own file picker rejects.
   */
  requireThreeJSRenderable?: boolean
  /**
   * Allow `.blend` primaries. Off unless Blender is enabled server-side, matching the
   * filter the grid already applies to drag-and-drop and multi-file uploads.
   */
  allowBlend?: boolean
}

/** Whether a file may be the primary of an import group, under the given gates. */
function isPrimaryCandidate(
  path: string,
  options: ImportGroupingOptions
): boolean {
  const ext = extensionOf(path)
  if (!isSupportedModelFormat(ext)) return false
  if (ext === '.blend') return options.allowBlend === true
  if (options.requireThreeJSRenderable) return isThreeJSRenderable(ext)
  return true
}

/**
 * Group a picked folder's files into importable model groups by directory: each
 * supported primary model file (one per subfolder in the glTF-Sample-Assets and
 * Synty layouts) is paired with the non-primary files under its directory, whose
 * relative path is expressed as the primary references it (e.g. `scene.bin`,
 * `textures/wood.png`).
 */
export function groupFilesForImport(
  files: FileList | File[],
  options: ImportGroupingOptions = {}
): ModelImportGroup[] {
  const entries = Array.from(files).map(file => ({ file, path: pathOf(file) }))
  // A rejected primary (a .blend with Blender off, a .dae) must not become an
  // *auxiliary* of a neighbouring model either — it is a model, not a resource.
  const isModelFile = (path: string): boolean =>
    isSupportedModelFormat(extensionOf(path))
  const isPrimary = (path: string): boolean => isPrimaryCandidate(path, options)

  const primaries = entries.filter(e => isPrimary(e.path))

  return primaries.map(primary => {
    const dir = directoryOf(primary.path)
    const auxiliaries = entries
      .filter(
        e => e !== primary && !isModelFile(e.path) && isUnder(e.path, dir)
      )
      .map(e => ({ file: e.file, relativePath: relativeTo(e.path, dir) }))

    return { primary: primary.file, auxiliaries }
  })
}
