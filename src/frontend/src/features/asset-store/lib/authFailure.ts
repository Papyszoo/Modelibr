import { ApiClientError } from '@/lib/apiBase'

/**
 * True when a failed token refresh means the SESSION is gone, rather than the
 * store being unreachable or unhappy.
 *
 * Only an auth rejection invalidates a refresh token. A 429 from a rate-limited
 * store, a 502 from one that is restarting, and every network error are
 * transient - treating them as an expired session signs the user out of a
 * session that still works and throws away their store library view. Both
 * refresh paths (the proactive loop in session.ts and the 401-retry interceptor
 * in api/storeApi.ts) share this rule.
 */
export function isTerminalAuthFailure(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    !error.isNetworkError &&
    (error.status === 401 || error.status === 403)
  )
}
