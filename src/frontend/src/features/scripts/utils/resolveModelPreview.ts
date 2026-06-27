import { getFileUrl } from '@/features/models/api/modelApi'
import { getFileExtension, type Model } from '@/utils/fileUtils'

/** Formats the scene preview can load a material onto (matches Model.tsx loaders). */
export const SUPPORTED_MODEL_FORMATS = [
  'obj',
  'fbx',
  'gltf',
  'glb',
  'stl',
  '3mf',
]

export interface ModelPreviewTarget {
  url: string
  extension: string
}

/**
 * Resolves which of a model's files the scene preview should load, mirroring the
 * 3D viewer: prefer the file flagged `isRenderable`, else the first file. Returns
 * the `/files/{id}` URL + lowercase extension, or null when there's nothing
 * loadable (no files, or the renderable file isn't a supported mesh format).
 *
 * The previous bug used `files[0]` + the model URL, so any model whose first
 * file wasn't a renderable mesh silently fell back to the primitive.
 */
export function resolveModelPreview(
  model: Model | null | undefined
): ModelPreviewTarget | null {
  const files = model?.files ?? []
  const renderable = files.find(f => f.isRenderable) ?? files[0]
  if (!renderable) return null

  const extension = getFileExtension(renderable.originalFileName).toLowerCase()
  if (!SUPPORTED_MODEL_FORMATS.includes(extension)) return null

  return { url: getFileUrl(renderable.id), extension }
}
