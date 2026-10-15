import type { VfxSummary } from '../../types'
import { thumbnailMayChange } from '../vfxThumbnails'

const NOW = Date.parse('2026-10-09T12:00:00Z')

const effect = (
  secondsAgo: number,
  thumbnailUrl: string | null = null
): VfxSummary => ({
  id: 1,
  name: 'Sparks',
  duration: 2,
  componentCount: 0,
  componentTypes: [],
  updatedAt: new Date(NOW - secondsAgo * 1000).toISOString(),
  thumbnailUrl,
})

describe('thumbnailMayChange', () => {
  // Regression: the list showed the placeholder until the user refreshed, because the
  // worker renders after the save returns and nothing told the browser.
  it('keeps polling for a freshly saved effect that has no thumbnail yet', () => {
    expect(thumbnailMayChange([effect(20)], NOW)).toBe(true)
  })

  // Regression guard: an effect made before thumbnails existed never gets one, and
  // polling for it forever would hammer the API for as long as the tab is open.
  it('stops polling for an old effect that never got a thumbnail', () => {
    expect(thumbnailMayChange([effect(60 * 60 * 24 * 30)], NOW)).toBe(false)
  })

  it('polls briefly after an edit so the re-render replaces the old picture', () => {
    expect(
      thumbnailMayChange([effect(10, '/vfx/1/thumbnail/file?v=a')], NOW)
    ).toBe(true)
    expect(
      thumbnailMayChange([effect(5 * 60, '/vfx/1/thumbnail/file?v=a')], NOW)
    ).toBe(false)
  })

  it('does not poll for an empty or unloaded list', () => {
    expect(thumbnailMayChange([], NOW)).toBe(false)
    expect(thumbnailMayChange(undefined, NOW)).toBe(false)
  })
})
