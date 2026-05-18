import * as THREE from 'three'

// 1x1 transparent PNG. Returned in place of unresolvable texture URLs so
// Three's loaders can finish parsing without firing real network requests.
const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII='

// Our backend serves files by numeric ID at /api/files/<id>. This manager
// is only attached to the top-level model loaders (FBX/OBJ/GLTF), so the
// only legitimate URLs that flow through it are the model file itself and
// any URLs the loader synthesises after we hand it a data: substitute.
// Everything else is a model-internal texture reference (e.g. FBX-baked
// "chest_Specular.tga" or "C:\Assets\chest_Specular" with no extension)
// that will 400 against the strictly-typed file route and crash the WebGL
// context. Inverted allowlist: pass through only the shapes we know are
// safe; rewrite the rest to a transparent pixel.
const OUR_FILE_ENDPOINT_RE = /^https?:\/\/[^/]+\/api\/files\/\d+(?:\?.*)?$|^\/api\/files\/\d+(?:\?.*)?$/

function rewriteTextureUrl(url: string): string {
  if (OUR_FILE_ENDPOINT_RE.test(url)) return url
  if (url.startsWith('data:') || url.startsWith('blob:')) return url
  return TRANSPARENT_PIXEL
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
