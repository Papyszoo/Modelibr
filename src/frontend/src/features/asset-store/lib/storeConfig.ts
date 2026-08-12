/**
 * Store origin configuration. The Asset Store page is an OPTIONAL online
 * surface — when VITE_STORE_URL is unset the page renders its unconfigured
 * state and nothing else in the app may depend on it (local-first).
 */
import { readStoreUrlEnv } from './storeEnv'

/**
 * Configured store origin without a trailing slash, or null when unset OR
 * rejected (see getStoreUrlConfigError). Rejected URLs behave as unconfigured
 * everywhere except the page's status message, so store credentials can never
 * be sent to a URL the backend importer would refuse anyway.
 */
export function getConfiguredStoreUrl(): string | null {
  const raw = readStoreUrlEnv()
  if (!raw || !raw.trim()) return null
  const url = stripTrailingSlashes(raw.trim())
  return getUrlProblem(url) === null ? url : null
}

/**
 * Why a SET VITE_STORE_URL is being ignored, or null when it is unset or
 * valid. Mirrors the backend's StoreUrlSafety rule (https required; http only
 * for loopback) — enforced here too so the login form never posts credentials
 * over cleartext http to a remote host.
 */
export function getStoreUrlConfigError(): string | null {
  const raw = readStoreUrlEnv()
  if (!raw || !raw.trim()) return null
  return getUrlProblem(stripTrailingSlashes(raw.trim()))
}

function getUrlProblem(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return `VITE_STORE_URL is not a valid absolute URL: "${url}".`
  }
  if (parsed.protocol === 'https:') return null
  if (parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname)) {
    return null
  }
  return 'VITE_STORE_URL must use https (plain http is only allowed for a store running on localhost).'
}

/** Same loopback set the backend's StoreUrlSafety accepts for plain http. */
function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host === 'localhost' || host === '[::1]' || /^127\./.test(host)
}

/**
 * Resolves a preview/thumbnail URL from a store response against the configured
 * store origin. The store emits RELATIVE urls whenever its own PublicBaseUrl is
 * unset — and a relative `src` in an <img> resolves against Modelibr's origin,
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

  const storeUrl = getConfiguredStoreUrl()
  try {
    // A relative url needs the store as its base; an absolute one ignores it.
    return new URL(url, storeUrl ? `${storeUrl}/` : undefined).toString()
  } catch {
    return null
  }
}

/**
 * Normalizes a store URL for provenance matching (the backend stores the
 * storeUrl string it was given; compare case-insensitively and ignore
 * trailing slashes so `https://Store.example/` matches `https://store.example`).
 */
export function normalizeStoreUrl(url: string | null | undefined): string {
  if (!url) return ''
  return stripTrailingSlashes(url.trim()).toLowerCase()
}

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, '')
}
