// Multi-file glTF external-resource resolution — shared cross-runtime helper.
//
// A loose .gltf references its buffers (.bin) and textures by relative URI
// (e.g. "scene.bin", "textures/wood.png"). When such a glTF is loaded from a
// data URL (server-side thumbnail render) or an API URL (in-app viewer), those
// relative URIs cannot resolve on their own. This builds the URLModifier a
// three.js LoadingManager needs to map each requested sub-resource URL to an
// already-uploaded sibling, provided as a { relativePath: url } map.
//
// Offline invariant: the resolver only ever returns a caller-supplied URL
// (typically a data: URL) or the original request untouched. It never fabricates
// an external host, so a missing reference resolves against the local page origin
// and fails locally — it is never fetched from the network. A genuine embedded
// data URI matches no key and is returned unchanged for the loader to decode.
//
// Pure and dependency-light on purpose (no THREE): runs in the Vite frontend
// bundle, this worker's classic-script render page, and Vitest alike.

function stripQueryAndHash(value) {
  return value.split('#')[0].split('?')[0]
}

function decode(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function clean(value) {
  return decode(stripQueryAndHash(String(value))).replace(/\\/g, '/')
}

function basename(value) {
  const i = value.lastIndexOf('/')
  return i < 0 ? value : value.slice(i + 1)
}

/**
 * Normalize a relative path/key to the forward-slash, no-leading-`./`-or-`/`
 * form glTF URIs use, so it matches how the loader requests sub-resources.
 * @param {string} key
 * @returns {string}
 */
export function normalizeResourceKey(key) {
  let out = clean(key)
  while (out.startsWith('./')) out = out.slice(2)
  return out.replace(/^\/+/, '')
}

/**
 * Build a three.js `LoadingManager.setURLModifier` callback that resolves a
 * glTF's external URIs against the supplied resource map.
 * @param {Record<string, string>|Map<string, string>|null|undefined} resources
 *   Map of relative path (as the glTF references it) -> resolvable URL (data URL).
 * @returns {(url: string) => string} A URL modifier: mapped URL, or the input untouched.
 */
export function buildResourceResolver(resources) {
  const map = new Map()

  const entries =
    resources instanceof Map
      ? resources.entries()
      : resources
        ? Object.entries(resources)
        : []

  for (const [key, value] of entries) {
    if (typeof value === 'string' && value.length > 0) {
      map.set(normalizeResourceKey(key), value)
    }
  }

  // Prefer the most specific (longest) key when suffix-matching so that
  // "textures/wood.png" wins over a bare "wood.png".
  const keysByLength = [...map.keys()].sort((a, b) => b.length - a.length)

  return function resolveUrl(url) {
    if (typeof url !== 'string' || url.length === 0) return url

    // NB: no early `data:` passthrough. When the main .gltf is itself loaded from
    // a data URL, GLTFLoader resolves an external ref against the base64 base path,
    // producing a mangled "data:...<base64>/scene.bin" — which we DO want to
    // resolve. A genuine embedded data URI is pure base64 (no '.'), so it can never
    // suffix-match a real filename key (which carries a '.ext') and falls through
    // to the untouched return below.
    const normalized = clean(url)

    // 1. Exact relative-path match.
    if (map.has(normalized)) return map.get(normalized)

    // 2. Suffix match on the full relative key (handles a resolved absolute URL
    //    whose tail preserves the glTF's subfolder, e.g. ".../textures/wood.png").
    for (const key of keysByLength) {
      if (normalized === key || normalized.endsWith('/' + key)) {
        return map.get(key)
      }
    }

    // 3. Basename fallback (handles the mangled base path a data-URL main
    //    resource produces, where only the filename survives).
    const base = basename(normalized)
    if (map.has(base)) return map.get(base)
    for (const key of keysByLength) {
      if (basename(key) === base) return map.get(key)
    }

    // Unresolved — return untouched (resolves locally, never network; see header).
    return url
  }
}
