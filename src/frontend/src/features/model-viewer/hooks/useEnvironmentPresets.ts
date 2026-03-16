import { useCallback, useEffect, useRef, useState } from 'react'

import {
  BUNDLED_HDR_PATH,
  BUNDLED_PRESET,
  ENVIRONMENT_PRESETS,
  getCachedPresets,
  resolveHdrUrl,
} from '@/features/model-viewer/utils/environmentPresets'

export interface EnvironmentAvailability {
  /** Whether the browser is currently online. */
  isOnline: boolean
  /** Set of presets that are available (bundled or cached). */
  availablePresets: Set<string>
  /** The resolved HDR URL for the active preset. */
  hdrUrl: string
  /** Whether the HDR is still being fetched/resolved. */
  loading: boolean
  /** The effective preset name (may differ from requested if fallback occurred). */
  effectivePreset: string
}

/**
 * Manages environment preset availability based on online/offline status
 * and Cache API state. Returns the resolved HDR URL and availability info.
 */
export function useEnvironmentPresets(
  requestedPreset: string,
): EnvironmentAvailability {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [availablePresets, setAvailablePresets] = useState<Set<string>>(
    () => new Set([BUNDLED_PRESET]),
  )
  const [hdrUrl, setHdrUrl] = useState(BUNDLED_HDR_PATH)
  const [loading, setLoading] = useState(false)
  const [effectivePreset, setEffectivePreset] = useState(requestedPreset)
  const prevBlobUrl = useRef<string | null>(null)

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Refresh cached presets when online status changes
  const refreshAvailability = useCallback(async () => {
    const cached = await getCachedPresets()
    // When online, all presets are available (can be fetched)
    if (navigator.onLine) {
      setAvailablePresets(new Set(ENVIRONMENT_PRESETS))
    } else {
      setAvailablePresets(cached)
    }
  }, [])

  useEffect(() => {
    void refreshAvailability()
  }, [isOnline, refreshAvailability])

  // Resolve HDR URL when preset changes
  useEffect(() => {
    let cancelled = false

    async function resolve() {
      setLoading(true)

      // Revoke previous blob URL to avoid memory leaks
      if (prevBlobUrl.current) {
        URL.revokeObjectURL(prevBlobUrl.current)
        prevBlobUrl.current = null
      }

      const url = await resolveHdrUrl(requestedPreset)

      if (cancelled) {
        // If we got a blob URL but the effect was cancelled, clean it up
        if (url.startsWith('blob:')) URL.revokeObjectURL(url)
        return
      }

      setHdrUrl(url)
      setLoading(false)

      // Track if we fell back to city
      if (url === BUNDLED_HDR_PATH && requestedPreset !== BUNDLED_PRESET) {
        setEffectivePreset(BUNDLED_PRESET)
      } else {
        setEffectivePreset(requestedPreset)
      }

      if (url.startsWith('blob:')) {
        prevBlobUrl.current = url
      }

      // After successful fetch, refresh availability (new preset may now be cached)
      void refreshAvailability()
    }

    void resolve()

    return () => {
      cancelled = true
    }
  }, [requestedPreset, refreshAvailability])

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (prevBlobUrl.current) {
        URL.revokeObjectURL(prevBlobUrl.current)
      }
    }
  }, [])

  return { isOnline, availablePresets, hdrUrl, loading, effectivePreset }
}
