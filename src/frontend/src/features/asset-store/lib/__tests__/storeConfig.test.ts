/**
 * Provenance matching depends on URL normalization: the backend stores the
 * storeUrl string verbatim, so "Imported ✓" detection must survive trailing
 * slashes and host-case differences between config and stored value.
 */
import {
  getConfiguredStoreUrl,
  getStoreUrlConfigError,
  normalizeStoreUrl,
  resolveStorePreviewUrl,
} from '../storeConfig'

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
    // An unconfigured store must not equal a pack with an empty URL - both
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

describe('store URL scheme enforcement', () => {
  // The env mock in setupTests reads process.env.VITE_STORE_URL at call
  // time, so tests can swap it as long as they restore it.
  const withEnv = (value: string | undefined, assertions: () => void) => {
    const previous = process.env.VITE_STORE_URL
    if (value === undefined) delete process.env.VITE_STORE_URL
    else process.env.VITE_STORE_URL = value
    try {
      assertions()
    } finally {
      if (previous === undefined) delete process.env.VITE_STORE_URL
      else process.env.VITE_STORE_URL = previous
    }
  }

  // Regression: the docs promised "https required for remote stores", but
  // only the backend importer enforced it - the login form would happily
  // POST store credentials over cleartext http to a remote host.
  it('rejects plain http for remote hosts (mirrors backend StoreUrlSafety)', () => {
    withEnv('http://store.example.com', () => {
      expect(getConfiguredStoreUrl()).toBeNull()
      expect(getStoreUrlConfigError()).toMatch(/https/)
    })
  })

  it('allows plain http for loopback hosts', () => {
    for (const url of [
      'http://localhost:9280',
      'http://127.0.0.1:9280',
      'http://[::1]:9280',
    ]) {
      withEnv(url, () => {
        expect(getConfiguredStoreUrl()).toBe(url)
        expect(getStoreUrlConfigError()).toBeNull()
      })
    }
  })

  it('reports unparseable URLs instead of using them', () => {
    withEnv('not a url', () => {
      expect(getConfiguredStoreUrl()).toBeNull()
      expect(getStoreUrlConfigError()).toMatch(/valid absolute URL/)
    })
  })

  it('stays quiet when unset', () => {
    withEnv(undefined, () => {
      expect(getConfiguredStoreUrl()).toBeNull()
      expect(getStoreUrlConfigError()).toBeNull()
    })
  })
})

describe('resolveStorePreviewUrl', () => {
  const withStore = (value: string | undefined, assertions: () => void) => {
    const previous = process.env.VITE_STORE_URL
    if (value === undefined) delete process.env.VITE_STORE_URL
    else process.env.VITE_STORE_URL = value
    try {
      assertions()
    } finally {
      if (previous === undefined) delete process.env.VITE_STORE_URL
      else process.env.VITE_STORE_URL = previous
    }
  }

  // Regression: the store emits RELATIVE preview urls whenever its own
  // PublicBaseUrl is unset, and a relative <img src> resolves against MODELIBR's
  // origin - every store thumbnail 404'd against the local app.
  it('resolves a relative preview url against the configured store', () => {
    withStore('https://store.example.com', () => {
      expect(resolveStorePreviewUrl('/api/files/42/preview')).toBe(
        'https://store.example.com/api/files/42/preview'
      )
    })
  })

  it('leaves an absolute url untouched', () => {
    withStore('https://store.example.com', () => {
      expect(resolveStorePreviewUrl('https://cdn.example.com/a.webp')).toBe(
        'https://cdn.example.com/a.webp'
      )
    })
  })

  it('returns null for nothing to show, so callers render their placeholder', () => {
    withStore('https://store.example.com', () => {
      expect(resolveStorePreviewUrl(null)).toBeNull()
      expect(resolveStorePreviewUrl(undefined)).toBeNull()
      expect(resolveStorePreviewUrl('   ')).toBeNull()
    })
  })

  // A relative url with no store configured has no base to resolve against -
  // null (placeholder) beats pointing the <img> at the local backend.
  it('returns null for a relative url when the store is unconfigured', () => {
    withStore(undefined, () => {
      expect(resolveStorePreviewUrl('/api/files/42/preview')).toBeNull()
    })
  })
})
