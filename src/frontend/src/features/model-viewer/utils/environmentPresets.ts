/**
 * Environment preset configuration.
 *
 * Only "city" is bundled locally (~1.5 MB). All other presets are fetched
 * on demand from the drei assets CDN and cached via the Cache API.
 * When offline, unavailable presets are disabled unless already cached.
 */

const DREI_CDN =
  'https://raw.githack.com/pmndrs/drei-assets/456060a26bbeb8fdf79326f224b6d99b8bcce736/hdri/'

/** Maps drei preset names to HDR filenames (same mapping drei uses internally). */
export const HDR_FILENAMES: Record<string, string> = {
  apartment: 'lebombo_1k.hdr',
  city: 'potsdamer_platz_1k.hdr',
  dawn: 'kiara_1_dawn_1k.hdr',
  forest: 'forest_slope_1k.hdr',
  lobby: 'st_fagans_interior_1k.hdr',
  night: 'dikhololo_night_1k.hdr',
  park: 'rooitou_park_1k.hdr',
  studio: 'studio_small_03_1k.hdr',
  sunset: 'venice_sunset_1k.hdr',
  warehouse: 'empty_warehouse_01_1k.hdr',
}

export const ENVIRONMENT_PRESETS = Object.keys(HDR_FILENAMES)

/** The only preset that ships with the app bundle. */
export const BUNDLED_PRESET = 'city'
export const BUNDLED_HDR_PATH = '/hdri/potsdamer_platz_1k.hdr'

const CACHE_NAME = 'modelibr-hdri'

/** Check if a preset's HDR file is in the Cache API. */
export async function isPresetCached(preset: string): Promise<boolean> {
  if (preset === BUNDLED_PRESET) return true
  try {
    const cache = await caches.open(CACHE_NAME)
    const url = DREI_CDN + HDR_FILENAMES[preset]
    const response = await cache.match(url)
    return response !== undefined
  } catch {
    return false
  }
}

/** Check cache status for all non-bundled presets. */
export async function getCachedPresets(): Promise<Set<string>> {
  const cached = new Set<string>([BUNDLED_PRESET])
  try {
    const cache = await caches.open(CACHE_NAME)
    const keys = await cache.keys()
    const cachedUrls = new Set(keys.map(r => r.url))
    for (const [preset, filename] of Object.entries(HDR_FILENAMES)) {
      if (preset === BUNDLED_PRESET) continue
      if (cachedUrls.has(DREI_CDN + filename)) {
        cached.add(preset)
      }
    }
  } catch {
    // Cache API not available — only bundled preset is available
  }
  return cached
}

/**
 * Resolve an HDR file URL for a preset.
 * - Bundled preset → local path
 * - Cached preset → blob URL from cache
 * - Online → fetch, cache, return blob URL
 * - Offline + uncached → fallback to bundled preset
 */
export async function resolveHdrUrl(preset: string): Promise<string> {
  if (preset === BUNDLED_PRESET) return BUNDLED_HDR_PATH

  const filename = HDR_FILENAMES[preset]
  if (!filename) return BUNDLED_HDR_PATH

  const cdnUrl = DREI_CDN + filename

  try {
    const cache = await caches.open(CACHE_NAME)

    // Check cache first
    const cached = await cache.match(cdnUrl)
    if (cached) {
      const blob = await cached.blob()
      return URL.createObjectURL(blob)
    }

    // Not cached — try to fetch
    if (!navigator.onLine) return BUNDLED_HDR_PATH

    const response = await fetch(cdnUrl)
    if (!response.ok) return BUNDLED_HDR_PATH

    // Cache the response for offline use
    await cache.put(cdnUrl, response.clone())

    const blob = await response.blob()
    return URL.createObjectURL(blob)
  } catch {
    return BUNDLED_HDR_PATH
  }
}
