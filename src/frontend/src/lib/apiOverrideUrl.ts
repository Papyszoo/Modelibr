/**
 * Validation for the `?api=` render override.
 *
 * Lives in its own module (rather than next to `overrideApiBaseUrl`) so it
 * stays free of `import.meta` and can be unit tested directly: `@/lib/apiBase`
 * reads `import.meta.env` at module scope and is globally mocked in Jest.
 */

/** The only schemes the `?api=` override may carry. */
const ALLOWED_API_OVERRIDE_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * Validates the `?api=` render override that `main.tsx` reads from
 * `window.location.search`, returning the normalised base URL to apply or null
 * to ignore the override and keep the built-in default.
 *
 * A crafted render link controls this value, so only http:/https: origins and
 * relative paths (the shape `resolveApiAssetUrl` already resolves against
 * `baseURL`) are accepted; `javascript:`, `data:` and malformed input are
 * rejected. Parsing with `new URL` and allow-listing `protocol` is the shape
 * CodeQL recognises as a URL sanitizer.
 *
 * The result never ends in a slash: the app's URL builders join the base and
 * the path with a literal "/" (`getFileUrl`: `${baseURL}/files/{id}`), so a
 * trailing slash here turned every file request into `//files/{id}` - a 404.
 * `new URL` adds one for a bare origin (no path), so it is stripped back off.
 */
export function sanitizeApiBaseUrlOverride(raw: string | null): string | null {
  if (!raw) return null

  const value = raw.trim()
  if (!value) return null

  // Relative paths carry no scheme to smuggle; use them verbatim so the URL
  // builders resolve them against `baseURL`, matching the existing convention.
  if (value.startsWith('/')) return value

  try {
    const parsed = new URL(value)
    if (!ALLOWED_API_OVERRIDE_PROTOCOLS.has(parsed.protocol)) {
      return null
    }
    return parsed.toString().replace(/\/+$/, '')
  } catch {
    return null
  }
}
