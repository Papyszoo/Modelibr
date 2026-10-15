/**
 * The companion Asset Store's address.
 *
 * The store is built into Modelibr: this one constant is the origin the Asset
 * Store tab talks to, and there is no "unconfigured" state. Everything else in
 * the app stays local-first - if the store is unreachable, the page shows a
 * single quiet status and nothing else is affected.
 */
export const STORE_URL = 'https://store.modelibr.com'

/**
 * Normalizes a store URL for provenance matching (the backend stores the
 * storeUrl string it was given; compare case-insensitively and ignore
 * trailing slashes so `https://Store.example/` matches `https://store.example`).
 */
export function normalizeStoreUrl(url: string | null | undefined): string {
  if (!url) return ''
  return stripTrailingSlashes(url.trim()).toLowerCase()
}

/**
 * Resolves a preview/thumbnail URL from a store response against the store
 * origin. The store emits RELATIVE urls whenever its own PublicBaseUrl is
 * unset - and a relative `src` in an <img> resolves against Modelibr's origin,
 * asking the local app for an image it does not have. Absolute urls are returned
 * untouched; anything unresolvable becomes null so the caller shows its
 * placeholder instead of a broken image.
 *
 * This mirrors the same fallback the backend importer applies to download URLs
 * (StoreImportClient.DownloadFileAsync).
 */
export function resolveStorePreviewUrl(
  url: string | null | undefined
): string | null {
  if (!url || !url.trim()) return null

  try {
    // A relative url needs the store as its base; an absolute one ignores it.
    return new URL(url, `${STORE_URL}/`).toString()
  } catch {
    return null
  }
}

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, '')
}
