import * as THREE from 'three'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { RGBELoader } from 'three-stdlib'

export type EnvironmentMapLoader =
  | typeof THREE.TextureLoader
  | typeof RGBELoader
  | typeof EXRLoader

/**
 * The loader an environment map needs, chosen from the SOURCE file's extension.
 *
 * `.hdr` and `.exr` are not ordinary images: three's TextureLoader decodes them
 * to nothing usable, which looks like "the environment silently did not apply".
 * The extension comes from the asset's own file name because the file route
 * (`/files/{id}`) carries no suffix to read it from.
 *
 * Shared so the scene viewport and the environment-map preview cannot drift on
 * which loader a format gets.
 */
export function environmentMapLoader(extension: string): EnvironmentMapLoader {
  switch (extension.toLowerCase()) {
    case 'exr':
      return EXRLoader
    case 'hdr':
      return RGBELoader
    default:
      return THREE.TextureLoader
  }
}

/** True when the extension needs a data (HDR/float) loader, not a colour one. */
export function isHdrEnvironmentExtension(extension: string): boolean {
  const normalized = extension.toLowerCase()
  return normalized === 'hdr' || normalized === 'exr'
}
