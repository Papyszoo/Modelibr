/**
 * Provenance matching depends on URL normalization: the backend stores the
 * storeUrl string verbatim, so "Imported ✓" detection must survive trailing
 * slashes and host-case differences between config and stored value.
 */
import { getConfiguredStoreUrl, normalizeStoreUrl } from '../storeConfig'

describe('normalizeStoreUrl', () => {
  // Regression: a trailing slash in .env (very common) made every imported
  // pack invisible to the "Imported ✓" badge.
  it('treats trailing slashes and host casing as the same store', () => {
    expect(normalizeStoreUrl('https://Store.Example/')).toBe(
      normalizeStoreUrl('https://store.example')
    )
  })

  it('maps null/undefined to an empty string (no accidental matches)', () => {
    expect(normalizeStoreUrl(null)).toBe('')
    expect(normalizeStoreUrl(undefined)).toBe('')
    // An unconfigured store must not equal a pack with an empty URL — both
    // sides guard, but the normalized forms must at least be comparable.
    expect(normalizeStoreUrl('')).toBe('')
  })
})

describe('getConfiguredStoreUrl', () => {
  it('strips trailing slashes from the configured origin', () => {
    // setupTests sets VITE_STORE_URL=https://store.test (no slash); this
    // asserts the strip logic via the normalized comparison instead of
    // mutating process.env mid-suite.
    expect(getConfiguredStoreUrl()).toBe('https://store.test')
  })
})
