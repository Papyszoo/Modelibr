/**
 * Provenance matching depends on URL normalization: the backend stores the
 * storeUrl string verbatim, so "Imported ✓" detection must survive trailing
 * slashes and host-case differences between the fixed store URL and the stored
 * value.
 */
import {
  normalizeStoreUrl,
  resolveStorePreviewUrl,
  STORE_URL,
} from '../storeConfig'

describe('STORE_URL', () => {
  // The store is built in. This is the one address the Asset Store tab talks to;
  // there is no configuration variable and no "unconfigured" state.
  it('is the fixed Modelibr Store origin without a trailing slash', () => {
    expect(STORE_URL).toBe('https://store.modelibr.com')
  })
})

describe('normalizeStoreUrl', () => {
  // Regression: a trailing slash made every imported pack invisible to the
  // "Imported ✓" badge when the stored provenance had one.
  it('treats trailing slashes and host casing as the same store', () => {
    expect(normalizeStoreUrl('https://Store.Example/')).toBe(
      normalizeStoreUrl('https://store.example')
    )
  })

  it('maps null/undefined to an empty string (no accidental matches)', () => {
    expect(normalizeStoreUrl(null)).toBe('')
    expect(normalizeStoreUrl(undefined)).toBe('')
    expect(normalizeStoreUrl('')).toBe('')
  })
})

describe('resolveStorePreviewUrl', () => {
  // Regression: the store emits RELATIVE preview urls whenever its own
  // PublicBaseUrl is unset, and a relative <img src> resolves against MODELIBR's
  // origin - every store thumbnail 404'd against the local app.
  it('resolves a relative preview url against the store', () => {
    expect(resolveStorePreviewUrl('/api/files/42/preview')).toBe(
      'https://store.modelibr.com/api/files/42/preview'
    )
  })

  it('leaves an absolute url untouched', () => {
    expect(resolveStorePreviewUrl('https://cdn.example.com/a.webp')).toBe(
      'https://cdn.example.com/a.webp'
    )
  })

  it('returns null for nothing to show, so callers render their placeholder', () => {
    expect(resolveStorePreviewUrl(null)).toBeNull()
    expect(resolveStorePreviewUrl(undefined)).toBeNull()
    expect(resolveStorePreviewUrl('   ')).toBeNull()
  })
})
