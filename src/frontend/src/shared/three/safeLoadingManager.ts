import * as THREE from 'three'

// 1x1 transparent PNG. Returned in place of unresolvable texture URLs so
// Three's loaders can finish parsing without firing real network requests.
const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII='

// Our backend serves files by numeric ID at /api/files/<id>. Anything that
// doesn't match this shape and looks like a texture filename is something
// the model file itself referenced (e.g. FBX-internal "chest_Specular.tga")
// and will 400 against the strictly-typed route, taking the WebGL context
// down with it. Replace those with a transparent pixel.
const TEXTURE_EXT_RE =
  /\.(?:tga|png|jpe?g|tif?f|exr|webp|bmp|hdr|dds|gif)(?:\?.*)?$/i
const OUR_FILE_ENDPOINT_RE = /\/api\/files\/\d+(?:\?.*)?$/

function rewriteTextureUrl(url: string): string {
  if (OUR_FILE_ENDPOINT_RE.test(url)) return url
  if (TEXTURE_EXT_RE.test(url)) return TRANSPARENT_PIXEL
  return url
}

/**
 * Shared LoadingManager that short-circuits embedded texture references
 * (filename-only paths a model format like FBX or OBJ/MTL stores internally)
 * to a 1x1 transparent PNG. Attach to a Three.js loader via
 * `loader.manager = safeLoadingManager` so its in-format texture parsing
 * does not hit /api/files/<filename> and crash the server route.
 *
 * Modelibr texture sets are loaded out-of-band by useChannelExtractedTextures
 * and TexturedGeometry — they don't go through this manager.
 */
export const safeLoadingManager = new THREE.LoadingManager()
safeLoadingManager.setURLModifier(rewriteTextureUrl)

/** Test-only export. */
export const __test = { rewriteTextureUrl }
