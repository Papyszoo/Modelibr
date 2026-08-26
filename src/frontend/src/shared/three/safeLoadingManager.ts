import * as THREE from 'three'

// 1x1 transparent PNG. Returned in place of unresolvable texture URLs so
// Three's loaders can finish parsing without firing real network requests.
const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII='

// Our backend serves files by numeric ID under /files/<id>. The URL prefix
// varies by deployment: dev/e2e talks to the WebAPI directly (host:8080/
// files/...), production hits nginx that rewrites /api/files/... → backend.
// Match the path shape, not the prefix. This manager is only attached to
// the top-level model loaders (FBX/OBJ/GLTF), so legitimate URLs flowing
// through it are the model file itself plus data:/blob: refs the loader
// synthesises after we hand it a substitute. Everything else is a model-
// internal texture reference (e.g. FBX-baked "chest_Specular.tga" or
// "C:\Assets\chest_Specular" with no extension) that will 400 against the
// strictly-typed file route and crash the WebGL context. Inverted allow-
// list: pass through what we know is safe; rewrite the rest.
const OUR_FILE_ENDPOINT_RE = /\/files\/\d+(?:\?[^/]*)?$/

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
 * and TexturedGeometry - they don't go through this manager.
 */
export const safeLoadingManager = new THREE.LoadingManager()
safeLoadingManager.setURLModifier(rewriteTextureUrl)

/**
 * A LoadingManager for **any format that references sibling files**: resolves the
 * paths inside the file (`scene.bin`, `textures/wood.png`, `chest_Specular.tga`) to
 * the `/files/<id>` URLs its auxiliary resources are served from, then falls back to
 * the same safe rewrite as {@link safeLoadingManager} for anything unmapped.
 *
 * Without this the viewer could not open an imported loose `.gltf` at all: the
 * relative URIs resolve against the file route, 404, and the shared manager replaces
 * them with a transparent pixel - which for the `.bin` buffer means the model has no
 * geometry. The worker's thumbnail renderer already resolves them (via the shared
 * `lib/gltfResources` helper); this is the browser half of the same idea.
 *
 * FBX and OBJ go through it for the same reason and one more. An FBX stores the
 * texture path the artist's machine had, so the transparent-pixel fallback used to be
 * unconditional for them: **an FBX rendered untextured in a scene, always**, and the
 * only way to give one colour was to bind a material by hand. The matching rules end
 * with a stem match for that case - the recorded `.tga` and the shipped `.png` are
 * the same texture.
 *
 * Build one per resource map and hand it to a loader as `loader.manager = …`. Returns
 * the shared safe manager when there is nothing to resolve, so packed `.glb` and
 * self-contained files keep exactly their current behaviour.
 */
export function createResourceManager(
  resources: Record<string, string> | null | undefined
): THREE.LoadingManager {
  const entries = Object.entries(resources ?? {}).filter(
    ([key, value]) =>
      Boolean(key) && typeof value === 'string' && value.length > 0
  )
  if (entries.length === 0) return safeLoadingManager

  // Normalise the way the loader asks for them: forward slashes, no leading "./".
  const byPath = new Map<string, string>()
  for (const [key, value] of entries) {
    byPath.set(normalizeKey(key), value)
  }
  // Longest key first so "textures/wood.png" wins over a bare "wood.png".
  const keys = [...byPath.keys()].sort((a, b) => b.length - a.length)

  const manager = new THREE.LoadingManager()
  manager.setURLModifier(url => {
    if (typeof url !== 'string' || url.length === 0) return url
    // The primary file itself and any data:/blob: the loader synthesises.
    if (OUR_FILE_ENDPOINT_RE.test(url)) return url
    if (url.startsWith('data:') || url.startsWith('blob:')) return url

    const normalized = normalizeKey(url)
    const direct = byPath.get(normalized)
    if (direct) return direct

    for (const key of keys) {
      if (normalized.endsWith('/' + key)) return byPath.get(key)!
    }

    const base = normalized.slice(normalized.lastIndexOf('/') + 1)
    const byBase = byPath.get(base)
    if (byBase) return byBase
    for (const key of keys) {
      if (key.slice(key.lastIndexOf('/') + 1) === base) return byPath.get(key)!
    }

    // Last resort: the same name with a different extension. An FBX records the
    // texture the artist's machine had - "chest_Specular.tga" - and the file the
    // pack actually ships is "chest_Specular.png". Nothing above can bridge that,
    // and the alternative is an untextured model. Deliberately last, and only on
    // an exact stem match, so it can never displace a real path.
    const stem = stemOf(base)
    if (stem.length > 0) {
      for (const key of keys) {
        const keyBase = key.slice(key.lastIndexOf('/') + 1)
        if (stemOf(keyBase) === stem) return byPath.get(key)!
      }
    }

    // Unmapped: same safety net as the shared manager - never a live request.
    return TRANSPARENT_PIXEL
  })
  return manager
}

/** A file name without its extension, lowercased. "" when there is nothing left. */
function stemOf(base: string): string {
  const dot = base.lastIndexOf('.')
  return (dot > 0 ? base.slice(0, dot) : base).toLowerCase()
}

function normalizeKey(value: string): string {
  let out = value.split('#')[0].split('?')[0].replace(/\\/g, '/')
  try {
    out = decodeURIComponent(out)
  } catch {
    // Leave a malformed escape sequence alone rather than throwing mid-load.
  }
  while (out.startsWith('./')) out = out.slice(2)
  return out.replace(/^\/+/, '')
}

/** Test-only export. */
export const __test = { rewriteTextureUrl }
