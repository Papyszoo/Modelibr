/**
 * Store origin configuration. The Asset Store page is an OPTIONAL online
 * surface — when VITE_STORE_URL is unset the page renders its unconfigured
 * state and nothing else in the app may depend on it (local-first).
 */
import { readStoreUrlEnv } from './storeEnv'

/** Configured store origin without a trailing slash, or null when unset. */
export function getConfiguredStoreUrl(): string | null {
  const raw = readStoreUrlEnv()
  if (!raw || !raw.trim()) return null
  return stripTrailingSlashes(raw.trim())
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
