/**
 * Regression: the `?api=` render override is read straight from
 * `window.location.search`, so a crafted render link used to be able to point
 * every asset URL the app builds at an arbitrary origin - including
 * `javascript:` and `data:` schemes. This validator is the single guard that
 * must reject anything but http:/https: and relative paths.
 */
import { sanitizeApiBaseUrlOverride } from '../apiOverrideUrl'

describe('sanitizeApiBaseUrlOverride', () => {
  it('accepts an https origin and returns it normalized', () => {
    expect(sanitizeApiBaseUrlOverride('https://render.example:8443/api')).toBe(
      'https://render.example:8443/api'
    )
  })

  it('accepts an http origin without leaving a trailing slash', () => {
    expect(sanitizeApiBaseUrlOverride('http://10.0.0.5:8080')).toBe(
      'http://10.0.0.5:8080'
    )
  })

  it('joins cleanly with the file URL builder for both origin spellings', () => {
    // Regression: `new URL(value).toString()` normalised a bare origin to
    // `http://host:8080/`, and `getFileUrl` builds `${baseURL}/files/{id}`, so
    // the render page requested `http://host:8080//files/1` and the worker's
    // 404 failed the scene render. `getFileUrl`'s module reads `import.meta`
    // and is mocked in Jest, so this mirrors the one join it does - exactly.
    for (const raw of ['http://host:8080', 'http://host:8080/']) {
      const base = sanitizeApiBaseUrlOverride(raw)
      expect(`${base}/files/1`).toBe('http://host:8080/files/1')
    }
  })

  it('rejects a javascript: URL', () => {
    expect(sanitizeApiBaseUrlOverride('javascript:alert(1)')).toBeNull()
  })

  it('rejects a data: URL', () => {
    expect(
      sanitizeApiBaseUrlOverride('data:text/html,<script>alert(1)</script>')
    ).toBeNull()
  })

  it('rejects malformed input', () => {
    expect(sanitizeApiBaseUrlOverride('http://[')).toBeNull()
    expect(sanitizeApiBaseUrlOverride('not a url')).toBeNull()
  })

  it('keeps a relative path verbatim, per the existing URL-builder convention', () => {
    expect(sanitizeApiBaseUrlOverride('/api')).toBe('/api')
  })

  // The caller (main.tsx) only calls overrideApiBaseUrl when this returns a
  // value, so a null result is what makes a missing or rejected override fall
  // back to the built-in default.
  it('returns null for a missing override so the caller falls back to the default', () => {
    expect(sanitizeApiBaseUrlOverride(null)).toBeNull()
    expect(sanitizeApiBaseUrlOverride('')).toBeNull()
    expect(sanitizeApiBaseUrlOverride('   ')).toBeNull()
  })

  it('returns null for a rejected override so the caller keeps the default', () => {
    expect(sanitizeApiBaseUrlOverride('javascript:alert(1)')).toBeNull()
  })
})
