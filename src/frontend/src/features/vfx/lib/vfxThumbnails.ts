import type { VfxSummary } from '../types'

/** Polling cadence while a thumbnail render is expected. */
export const THUMBNAIL_POLL_MS = 4000

/** An effect with no thumbnail this recently saved is assumed to be rendering. */
const PENDING_WINDOW_MS = 10 * 60 * 1000
/** A saved effect may be about to swap its old thumbnail for the re-render. */
const REFRESH_WINDOW_MS = 60 * 1000

/**
 * Whether the list should keep refetching because a thumbnail may be about to
 * appear or change.
 *
 * The worker renders after the save returns, and nothing tells the browser when
 * it is done, so the list asks again while a render is plausible - and stops
 * when it is not. An old effect that never got a thumbnail (made before they
 * existed) falls outside the window, so it does not poll forever.
 */
export function thumbnailMayChange(
  effects: VfxSummary[] | undefined,
  now: number = Date.now()
): boolean {
  return (effects ?? []).some(effect => {
    const age = now - Date.parse(effect.updatedAt)
    if (!Number.isFinite(age)) return false
    return effect.thumbnailUrl
      ? age < REFRESH_WINDOW_MS
      : age < PENDING_WINDOW_MS
  })
}
